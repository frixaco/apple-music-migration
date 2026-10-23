import { createServerFn } from '@tanstack/react-start'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { match, pinnedPlaylist } from '@/db/schema'
import type { Playlist, Song, Video } from '@/lib/types'
import {
  addSongsToPlaylists,
  appleForUser,
  artworkUrl,
  findAppleConnection,
} from '@/server/apple.server'
import { authMiddleware } from '@/server/auth-middleware'
import { findYouTubeAccount, youtubeForUser } from '@/server/youtube.server'
import { isFavoriteSongsPlaylist } from '@/lib/apple-music-client'
import { millisToSeconds } from '@/lib/matching'

const service = z.enum(['youtube', 'apple'])

export const listPlaylists = createServerFn()
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Playlist[]> => {
    const userId = context.user.id
    const [pins, youtubeAccount, apple] = await Promise.all([
      db.query.pinnedPlaylist.findMany({
        where: eq(pinnedPlaylist.userId, userId),
        orderBy: pinnedPlaylist.pinnedAt,
      }),
      findYouTubeAccount(userId),
      findAppleConnection(userId),
    ])
    const pinned = new Set(pins.map((pin) => `${pin.service}:${pin.playlistId}`))

    const youtubePlaylists = async (): Promise<Playlist[]> => {
      if (!youtubeAccount) return []
      const youtube = await youtubeForUser(userId)
      return (await youtube.listPlaylists()).map((playlist) => ({
        ...playlist,
        service: 'youtube',
        canEdit: true,
        isFavorites: false,
        pinned: pinned.has(`youtube:${playlist.id}`),
      }))
    }

    const applePlaylists = async (): Promise<Playlist[]> => {
      if (!apple) return []
      const { client } = await appleForUser(userId)
      const playlists = await client.getAllLibraryPlaylists()
      return Promise.all(
        playlists.map(async (playlist) => ({
          service: 'apple' as const,
          id: playlist.id,
          title: playlist.attributes?.name ?? 'Untitled',
          count: await client.getLibraryPlaylistTrackCount(playlist.id),
          canEdit: playlist.attributes?.canEdit ?? false,
          isFavorites: isFavoriteSongsPlaylist(playlist),
          pinned: pinned.has(`apple:${playlist.id}`),
        })),
      )
    }

    return (await Promise.all([youtubePlaylists(), applePlaylists()])).flat()
  })

export const setPinned = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({ service, playlistId: z.string(), pinned: z.boolean() }),
  )
  .handler(async ({ data, context }) => {
    const key = { userId: context.user.id, service: data.service, playlistId: data.playlistId }

    if (data.pinned) {
      await db.insert(pinnedPlaylist).values(key).onConflictDoNothing()
    } else {
      await db
        .delete(pinnedPlaylist)
        .where(
          and(
            eq(pinnedPlaylist.userId, key.userId),
            eq(pinnedPlaylist.service, key.service),
            eq(pinnedPlaylist.playlistId, key.playlistId),
          ),
        )
    }
  })

export const createPlaylist = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ service, title: z.string().trim().min(1) }))
  .handler(async ({ data, context }): Promise<string> => {
    if (data.service === 'youtube') {
      const youtube = await youtubeForUser(context.user.id)
      return youtube.createPlaylist(data.title)
    }

    const { client } = await appleForUser(context.user.id)
    const playlist = await client.createLibraryPlaylist({
      attributes: { name: data.title },
    })
    return playlist.id
  })

export const listVideos = createServerFn()
  .middleware([authMiddleware])
  .validator(z.object({ playlistId: z.string() }))
  .handler(async ({ data, context }): Promise<Video[]> => {
    const youtube = await youtubeForUser(context.user.id)
    const videos = await youtube.listVideos(data.playlistId)
    const matches = videos.length
      ? await db.query.match.findMany({
          columns: { videoId: true, status: true, outcome: true },
          where: and(
            eq(match.userId, context.user.id),
            inArray(
              match.videoId,
              videos.map((video) => video.videoId),
            ),
          ),
        })
      : []
    const matchByVideo = new Map(matches.map((item) => [item.videoId, item]))

    return videos.map((video) => {
      const found = matchByVideo.get(video.videoId)
      return {
        ...video,
        match: found ? { status: found.status, outcome: found.outcome } : null,
      }
    })
  })

export const listSongs = createServerFn()
  .middleware([authMiddleware])
  .validator(z.object({ playlistId: z.string() }))
  .handler(async ({ data, context }): Promise<Song[]> => {
    const { client } = await appleForUser(context.user.id)
    const tracks = await client.getAllLibraryPlaylistTracks(data.playlistId)
    const catalogIds = tracks.flatMap(
      (track) => track.attributes?.playParams?.catalogId ?? [],
    )
    const sources = catalogIds.length
      ? await db.query.match.findMany({
          where: and(
            eq(match.userId, context.user.id),
            inArray(match.appleSongId, catalogIds),
          ),
        })
      : []
    const sourceBySong = new Map(sources.map((item) => [item.appleSongId, item]))

    return tracks.map((track) => {
      const attributes = track.attributes ?? {}
      const catalogId = attributes.playParams?.catalogId ?? null
      const source = catalogId ? sourceBySong.get(catalogId) : undefined

      return {
        id: track.id,
        catalogId,
        name: attributes.name ?? '',
        artist: attributes.artistName ?? '',
        album: attributes.albumName ?? '',
        durationSeconds: millisToSeconds(attributes.durationInMillis),
        artworkUrl: artworkUrl(attributes.artwork, 200),
        source: source
          ? {
              videoId: source.videoId,
              title: source.title,
              sourcePlaylistTitle: source.sourcePlaylistTitle,
              position: source.position,
              durationSeconds: source.durationSeconds,
              thumbnailUrl: source.thumbnailUrl,
            }
          : null,
      }
    })
  })

/** Copies videos to another YouTube playlist, removing them from the source when moving. */
export const sendVideos = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      items: z.array(z.object({ videoId: z.string(), playlistItemId: z.string() })),
      targetPlaylistId: z.string(),
      removeFromSource: z.boolean(),
    }),
  )
  .handler(async ({ data, context }) => {
    const youtube = await youtubeForUser(context.user.id)
    await youtube.sendVideos(data.targetPlaylistId, data.items, data.removeFromSource)
  })

export const removeVideos = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ playlistItemIds: z.array(z.string()) }))
  .handler(async ({ data, context }) => {
    const youtube = await youtubeForUser(context.user.id)

    for (const playlistItemId of data.playlistItemIds) {
      await youtube.removePlaylistItem(playlistItemId)
    }
  })

export const addSongs = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      catalogIds: z.array(z.string()).min(1),
      playlistIds: z.array(z.string()).min(1),
    }),
  )
  .handler(async ({ data, context }) => {
    await addSongsToPlaylists(context.user.id, data.catalogIds, data.playlistIds)
  })

/** Apple Music only allows removing songs from Favourite Songs, by clearing their favourite rating. */
export const removeFavorites = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ librarySongIds: z.array(z.string()).min(1) }))
  .handler(async ({ data, context }) => {
    const { client } = await appleForUser(context.user.id)

    for (const librarySongId of data.librarySongIds) {
      await client.deleteLibrarySongRating(librarySongId)
    }
  })
