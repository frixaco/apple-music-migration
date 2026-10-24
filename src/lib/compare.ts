import {
  normalize,
  parseYouTubeTitle,
  scoreDuration,
  similarity,
} from './matching'
import type { Song, Video } from './types'

/** A video or song reduced to what two playlists are compared by. */
export type Track = {
  /** The row's id in its own list. */
  id: string
  title: string
  artist: string
  durationSeconds: number | null
  /** Identities that mean the same recording when shared: `video:<id>` and `song:<catalog id>`. */
  ids: string[]
}

/** How a track in the other playlist relates to one in this playlist. */
export type Likeness = {
  /** The id of the track in the other playlist. */
  id: string
  kind: 'same' | 'similar'
  /** Why it looks the same or similar, e.g. "Same title and artist". */
  reason: string
  score: number
}

export type CompareStatus = 'same' | 'similar' | 'missing'

export function videoTrack(
  video: Pick<Video, 'videoId' | 'title' | 'channel' | 'durationSeconds'>,
): Track {
  const parsed = parseYouTubeTitle(video.title, video.channel)
  return {
    id: video.videoId,
    title: parsed.track,
    artist: parsed.artist,
    durationSeconds: video.durationSeconds,
    ids: [`video:${video.videoId}`],
  }
}

export function songTrack(song: Song): Track {
  return {
    id: song.id,
    title: song.name,
    artist: song.artist,
    durationSeconds: song.durationSeconds,
    ids: [
      ...(song.catalogId ? [`song:${song.catalogId}`] : []),
      // A song added from a match run is the same recording as the video it came from.
      ...(song.source ? [`video:${song.source.videoId}`] : []),
    ],
  }
}

/** A title without tags that many unrelated songs share: 【…】 labels, featured artists and producers. 「…」 and 『…』 often hold the title itself, so they stay. */
function coreTitle(title: string): string {
  const core = title
    .replace(/【[^】]*】/g, ' ')
    .replace(/[([][^)\]]*\b(feat|ft|prod|with)\b[^)\]]*[)\]]/gi, ' ')
    .replace(/\s\b(feat|ft|prod|with)\b\.?\s.*$/i, ' ')
    .replace(/\bprod\.\S+/gi, ' ')
    .trim()
  return core || title
}

function compareTracks(left: Track, right: Track): Likeness | null {
  if (left.ids.some((id) => right.ids.includes(id))) {
    return { id: right.id, kind: 'same', reason: 'Same song', score: 2 }
  }

  const title = similarity(coreTitle(left.title), coreTitle(right.title))
  const artist = similarity(left.artist, right.artist)
  const length = scoreDuration(left.durationSeconds, right.durationSeconds)
  const score = title * 0.6 + artist * 0.3 + length * 0.1

  // A matching title alone is not enough: covers and unrelated songs share titles.
  if (title >= 0.88 && artist >= 0.5 && length >= 0.45) {
    return {
      id: right.id,
      kind: 'same',
      reason: 'Same title and artist',
      score,
    }
  }
  if (title >= 0.88) {
    return {
      id: right.id,
      kind: 'similar',
      reason:
        artist >= 0.5 ? 'Same title and artist, other length' : 'Same title',
      score,
    }
  }
  // Short titles share words by chance, so a merely similar title also needs the same artist.
  if (title >= 0.6 && artist >= 0.5) {
    return {
      id: right.id,
      kind: 'similar',
      reason: 'Same artist, similar title',
      score,
    }
  }
  return null
}

const stopWords = new Set(['the', 'feat', 'ft', 'featuring', 'and', 'remix'])

function titleWords(track: Track): string[] {
  return normalize(track.title)
    .split(' ')
    .filter((word) => word.length > 1 && !stopWords.has(word))
}

/**
 * For each track on the left, the tracks on the right that look the same or similar, best first.
 * Only pairs that share an identity or a title word are scored, so long playlists stay fast.
 */
export function comparePlaylists(
  left: Track[],
  right: Track[],
): Map<string, Likeness[]> {
  const byId = new Map<string, number[]>()
  const byWord = new Map<string, number[]>()
  const add = (index: Map<string, number[]>, key: string, value: number) => {
    const list = index.get(key)
    if (list) list.push(value)
    else index.set(key, [value])
  }
  right.forEach((track, position) => {
    for (const id of track.ids) add(byId, id, position)
    for (const word of new Set(titleWords(track))) add(byWord, word, position)
  })

  const result = new Map<string, Likeness[]>()
  for (const track of left) {
    const candidates = new Set<number>()
    for (const id of track.ids)
      for (const position of byId.get(id) ?? []) candidates.add(position)
    for (const word of titleWords(track))
      for (const position of byWord.get(word) ?? []) candidates.add(position)

    const likenesses = [...candidates]
      .flatMap((position) => compareTracks(track, right[position]) ?? [])
      .sort(
        (a, b) =>
          Number(b.kind === 'same') - Number(a.kind === 'same') ||
          b.score - a.score,
      )
      .slice(0, 5)
    result.set(track.id, likenesses)
  }
  return result
}

export function compareStatus(
  likenesses: Likeness[] | undefined,
): CompareStatus {
  if (!likenesses?.length) return 'missing'
  return likenesses[0].kind
}
