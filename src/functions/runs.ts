import { createServerFn } from '@tanstack/react-start'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { match, matchRun } from '@/db/schema'
import type { MatchRun } from '@/lib/types'
import { addSongsToPlaylists, appleForUser } from '@/server/apple.server'
import { authMiddleware } from '@/server/auth-middleware'
import { findCandidates, processRun } from '@/server/matching.server'
import { youtubeForUser } from '@/server/youtube.server'

async function findOpenRun(userId: string) {
  return db.query.matchRun.findFirst({
    where: and(eq(matchRun.userId, userId), isNull(matchRun.closedAt)),
  })
}

function runMatches(userId: string, runId: string, videoIds?: string[]) {
  return db.query.match.findMany({
    where: and(
      eq(match.userId, userId),
      eq(match.runId, runId),
      videoIds ? inArray(match.videoId, videoIds) : undefined,
    ),
    orderBy: match.position,
  })
}

function updateMatch(
  userId: string,
  videoIds: string[],
  values: Partial<typeof match.$inferInsert>,
) {
  return db
    .update(match)
    .set(values)
    .where(and(eq(match.userId, userId), inArray(match.videoId, videoIds)))
}

export const getOpenRun = createServerFn()
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<MatchRun | null> => {
    const run = await findOpenRun(context.user.id)
    if (!run) return null

    const matches = await runMatches(context.user.id, run.id)
    // Resumes searching after a server restart; a no-op while the run is already being processed.
    if (matches.some((item) => item.status === 'searching')) {
      void processRun(context.user.id, run.id)
    }

    return {
      id: run.id,
      sourcePlaylistId: run.sourcePlaylistId,
      sourcePlaylistTitle: run.sourcePlaylistTitle,
      targetPlaylistIds: run.targetPlaylistIds,
      removeFromSource: run.removeFromSource,
      createdAt: run.createdAt,
      matches,
    }
  })

/**
 * Searches Apple Music for the given videos. They join the open run, or start a new one, and the
 * search keeps running on the server while the client polls the run.
 */
export const startRun = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      sourcePlaylistId: z.string(),
      sourcePlaylistTitle: z.string(),
      targetPlaylistIds: z.array(z.string()).default([]),
      removeFromSource: z.boolean().default(false),
      videos: z
        .array(
          z.object({
            videoId: z.string(),
            playlistItemId: z.string(),
            position: z.number(),
            title: z.string(),
            channel: z.string(),
            durationSeconds: z.number().nullable(),
            thumbnailUrl: z.string().nullable(),
          }),
        )
        .min(1),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = context.user.id
    const { videos, ...runValues } = data
    const openRun = await findOpenRun(userId)
    const runId = openRun
      ? openRun.id
      : (await db.insert(matchRun).values({ userId, ...runValues }).returning())[0].id

    if (openRun) {
      await db
        .update(matchRun)
        .set({
          targetPlaylistIds: runValues.targetPlaylistIds,
          removeFromSource: runValues.removeFromSource,
        })
        .where(eq(matchRun.id, runId))
    }

    for (const video of videos) {
      const values = {
        ...video,
        userId,
        runId,
        sourcePlaylistId: data.sourcePlaylistId,
        sourcePlaylistTitle: data.sourcePlaylistTitle,
        status: 'searching' as const,
        query: '',
        confidence: null,
        candidates: [],
        selectedCandidateId: null,
        appleSongId: null,
        outcome: null,
      }
      await db
        .insert(match)
        .values(values)
        .onConflictDoUpdate({ target: [match.userId, match.videoId], set: values })
    }

    void processRun(userId, runId)
  })

export const closeRun = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await db
      .update(matchRun)
      .set({ closedAt: new Date() })
      .where(and(eq(matchRun.userId, context.user.id), isNull(matchRun.closedAt)))
  })

export const selectCandidate = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ videoId: z.string(), candidateId: z.string() }))
  .handler(async ({ data, context }) => {
    await updateMatch(context.user.id, [data.videoId], {
      status: 'found',
      selectedCandidateId: data.candidateId,
    })
  })

export const markNotFound = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ videoIds: z.array(z.string()).min(1) }))
  .handler(async ({ data, context }) => {
    await updateMatch(context.user.id, data.videoIds, {
      status: 'not_found',
      selectedCandidateId: null,
    })
  })

export const searchAgain = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ videoId: z.string(), term: z.string().trim().min(1) }))
  .handler(async ({ data, context }) => {
    const userId = context.user.id
    const item = await db.query.match.findFirst({
      where: and(eq(match.userId, userId), eq(match.videoId, data.videoId)),
    })
    if (!item) throw new Error('This video is not in the match run.')

    const { client, storefront } = await appleForUser(userId)
    const result = await findCandidates(client, storefront, item, data.term)
    await updateMatch(userId, [data.videoId], { ...result, selectedCandidateId: null })
  })

/** Adds each video's chosen song (or best option) to Apple Music playlists and marks it done. */
export const addToApple = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      videoIds: z.array(z.string()).min(1),
      playlistIds: z.array(z.string()).min(1),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = context.user.id
    const run = await findOpenRun(userId)
    if (!run) throw new Error('There is no open match run.')

    const chosen = (await runMatches(userId, run.id, data.videoIds)).flatMap((item) => {
      const songId = item.selectedCandidateId ?? item.candidates[0]?.id
      return songId ? [{ item, songId }] : []
    })
    if (chosen.length === 0) throw new Error('None of these videos has an Apple Music option.')

    const playlistNames = await addSongsToPlaylists(
      userId,
      chosen.map(({ songId }) => songId),
      data.playlistIds,
    )

    if (run.removeFromSource) {
      const youtube = await youtubeForUser(userId)
      for (const { item } of chosen) {
        await youtube.removePlaylistItem(item.playlistItemId)
      }
    }

    for (const { item, songId } of chosen) {
      await updateMatch(userId, [item.videoId], {
        status: 'done',
        appleSongId: songId,
        outcome: `In ${playlistNames.join(', ')}`,
      })
    }
  })

/** Sends videos with no usable match to another YouTube playlist and marks them done. */
export const moveToYouTube = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      videoIds: z.array(z.string()).min(1),
      playlistId: z.string(),
      playlistTitle: z.string(),
      removeFromSource: z.boolean(),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = context.user.id
    const run = await findOpenRun(userId)
    if (!run) throw new Error('There is no open match run.')

    const youtube = await youtubeForUser(userId)
    for (const item of await runMatches(userId, run.id, data.videoIds)) {
      await youtube.addVideo(data.playlistId, item.videoId)
      if (data.removeFromSource) {
        await youtube.removePlaylistItem(item.playlistItemId)
      }
    }

    await updateMatch(userId, data.videoIds, {
      status: 'done',
      outcome: `${data.removeFromSource ? 'Moved' : 'Copied'} to ${data.playlistTitle}`,
    })
  })
