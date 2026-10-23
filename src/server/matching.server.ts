import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { match } from '@/db/schema'
import type { Candidate, MatchStatus } from '@/lib/types'
import type {
  AppleMusicCatalogResource,
  AppleMusicClient,
} from '@/lib/apple-music-client'
import {
  buildSearchQueries,
  confidenceScore,
  dedupeCandidates,
  millisToSeconds,
  parseYouTubeTitle,
  scoreCandidate,
} from '@/lib/matching'
import { appleForUser, artworkUrl } from './apple.server'

const maxCandidates = 8
const concurrency = 4

type SearchableVideo = {
  title: string
  channel: string
  durationSeconds: number | null
}

export function toCandidate(
  resource: AppleMusicCatalogResource,
  score: number,
): Candidate {
  const attributes = resource.attributes ?? {}

  return {
    id: resource.id,
    name: attributes.name ?? '',
    artist: attributes.artistName ?? '',
    album: attributes.albumName ?? '',
    durationSeconds: millisToSeconds(attributes.durationInMillis),
    artworkUrl: artworkUrl(attributes.artwork, 120),
    url: attributes.url ?? null,
    score: Math.round(score * 100) / 100,
  }
}

export async function searchSongs(
  client: AppleMusicClient,
  storefront: string,
  term: string,
): Promise<AppleMusicCatalogResource[]> {
  const response = await client.searchCatalog({
    storefront,
    term,
    types: ['songs'],
    limit: 10,
  })

  return response.results?.songs?.data ?? []
}

/**
 * Searches Apple Music for a video's song and scores every result with the shared matcher.
 * `term` replaces the queries built from the title when the user searches again.
 */
export async function findCandidates(
  client: AppleMusicClient,
  storefront: string,
  video: SearchableVideo,
  term?: string,
) {
  const parsed = parseYouTubeTitle(video.title, video.channel)
  const queries = term
    ? [term]
    : buildSearchQueries(video.title, video.channel, parsed).slice(0, 3)
  const resources: AppleMusicCatalogResource[] = []

  for (const query of queries) {
    resources.push(...(await searchSongs(client, storefront, query)))
  }

  const scored = dedupeCandidates(resources)
    .map((resource) =>
      scoreCandidate(
        { channels: [video.channel], durationSeconds: video.durationSeconds },
        parsed,
        resource,
      ),
    )
    .sort((left, right) => right.rawScore - left.rawScore)
  const confidence = confidenceScore(scored[0] ?? null)

  return {
    query: queries[0] ?? '',
    confidence,
    status: statusForConfidence(confidence),
    candidates: scored
      .slice(0, maxCandidates)
      .map((score) => toCandidate(score.resource, score.rawScore)),
  }
}

function statusForConfidence(confidence: number): MatchStatus {
  if (confidence >= 4) return 'found'
  if (confidence === 3) return 'check'
  return 'not_found'
}

const activeRuns = new Set<string>()

/**
 * Searches every video in a run that is still waiting, a few at a time, saving each result as it
 * arrives. Safe to call again for a run that is already being processed.
 */
export async function processRun(userId: string, runId: string): Promise<void> {
  if (activeRuns.has(runId)) {
    return
  }

  activeRuns.add(runId)

  try {
    const { client, storefront } = await appleForUser(userId)
    const pending = await db.query.match.findMany({
      where: and(
        eq(match.userId, userId),
        eq(match.runId, runId),
        eq(match.status, 'searching'),
      ),
      orderBy: match.position,
    })

    const worker = async () => {
      for (let item = pending.shift(); item; item = pending.shift()) {
        const result = await findCandidates(client, storefront, item).catch(
          () => ({ query: '', confidence: 1, status: 'not_found' as const, candidates: [] }),
        )
        await db
          .update(match)
          .set({ ...result, selectedCandidateId: null })
          .where(and(eq(match.userId, userId), eq(match.videoId, item.videoId)))
      }
    }

    await Promise.all(Array.from({ length: concurrency }, worker))
  } finally {
    activeRuns.delete(runId)
  }
}
