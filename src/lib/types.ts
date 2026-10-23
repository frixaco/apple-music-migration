export type Service = 'youtube' | 'apple'

export type Playlist = {
  service: Service
  id: string
  title: string
  count: number
  /** Apple Music only lets apps add to playlists they can edit; Favourite Songs is filled by favouriting. */
  canEdit: boolean
  isFavorites: boolean
  pinned: boolean
}

export type Video = {
  playlistItemId: string
  videoId: string
  position: number
  title: string
  channel: string
  durationSeconds: number | null
  thumbnailUrl: string | null
  description: string
  addedAt: string
  /** This video's Apple Music match, if it was ever searched. */
  match: Pick<Match, 'status' | 'outcome'> | null
}

export type Song = {
  id: string
  catalogId: string | null
  name: string
  artist: string
  album: string
  durationSeconds: number | null
  artworkUrl: string | null
  /** The YouTube video this song was added from, if it came from a match run. */
  source: Pick<
    Match,
    | 'videoId'
    | 'title'
    | 'sourcePlaylistTitle'
    | 'position'
    | 'durationSeconds'
    | 'thumbnailUrl'
  > | null
}

export type Candidate = {
  id: string
  name: string
  artist: string
  album: string
  durationSeconds: number | null
  artworkUrl: string | null
  url: string | null
  score: number
}

/**
 * found: confidence 4–5 or picked by the user; check: confidence 3; not_found: 1–2, none, or marked;
 * done: added to Apple Music or moved to another YouTube playlist.
 */
export type MatchStatus = 'searching' | 'found' | 'check' | 'not_found' | 'done'

export type Match = {
  videoId: string
  playlistItemId: string
  sourcePlaylistId: string
  sourcePlaylistTitle: string
  position: number
  title: string
  channel: string
  durationSeconds: number | null
  thumbnailUrl: string | null
  query: string
  status: MatchStatus
  confidence: number | null
  candidates: Candidate[]
  selectedCandidateId: string | null
  appleSongId: string | null
  outcome: string | null
}

export type MatchRun = {
  id: string
  sourcePlaylistId: string
  sourcePlaylistTitle: string
  targetPlaylistIds: string[]
  removeFromSource: boolean
  createdAt: Date
  matches: Match[]
}

export type Connections = {
  youtube: { email: string | null } | null
  apple: { storefront: string; connectedAt: Date } | null
}
