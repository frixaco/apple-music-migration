import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { user } from './auth-schema'
import type { Candidate, MatchStatus, Service } from '@/lib/types'

export * from './auth-schema'

const userId = () =>
  text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' })

export const appleConnection = pgTable('apple_connection', {
  userId: userId().primaryKey(),
  /** Encrypted with BETTER_AUTH_SECRET, like the Google tokens. */
  musicUserToken: text('music_user_token').notNull(),
  storefront: text('storefront').notNull(),
  connectedAt: timestamp('connected_at').defaultNow().notNull(),
})

export const pinnedPlaylist = pgTable(
  'pinned_playlist',
  {
    userId: userId(),
    service: text('service').$type<Service>().notNull(),
    playlistId: text('playlist_id').notNull(),
    pinnedAt: timestamp('pinned_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.service, table.playlistId] }),
  ],
)

/** A batch of YouTube videos searched on Apple Music. Its results stay until the user closes it. */
export const matchRun = pgTable('match_run', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: userId(),
  sourcePlaylistId: text('source_playlist_id').notNull(),
  sourcePlaylistTitle: text('source_playlist_title').notNull(),
  /** Apple Music playlists preselected in "Add to Apple Music", set when the run came from "Move to". */
  targetPlaylistIds: jsonb('target_playlist_ids')
    .$type<string[]>()
    .notNull()
    .default([]),
  /** Remove sent videos from the source YouTube playlist, set when the run came from "Move to". */
  removeFromSource: boolean('remove_from_source').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  closedAt: timestamp('closed_at'),
})

/** The latest Apple Music match for one of a user's YouTube videos. */
export const match = pgTable(
  'match',
  {
    userId: userId(),
    videoId: text('video_id').notNull(),
    runId: text('run_id').references(() => matchRun.id, {
      onDelete: 'set null',
    }),
    sourcePlaylistId: text('source_playlist_id').notNull(),
    sourcePlaylistTitle: text('source_playlist_title').notNull(),
    playlistItemId: text('playlist_item_id').notNull(),
    position: integer('position').notNull(),
    title: text('title').notNull(),
    channel: text('channel').notNull(),
    durationSeconds: integer('duration_seconds'),
    thumbnailUrl: text('thumbnail_url'),
    query: text('query').notNull().default(''),
    status: text('status').$type<MatchStatus>().notNull(),
    confidence: integer('confidence'),
    candidates: jsonb('candidates').$type<Candidate[]>().notNull().default([]),
    selectedCandidateId: text('selected_candidate_id'),
    /** Catalog song added to Apple Music for this video. */
    appleSongId: text('apple_song_id'),
    /** What happened to a done video, e.g. "In Favourite Songs, All". */
    outcome: text('outcome'),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.videoId] })],
)
