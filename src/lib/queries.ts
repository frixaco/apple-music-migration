import { queryOptions } from '@tanstack/react-query'
import {
  getConnections,
  getDeveloperToken,
  getSession,
} from '@/functions/account'
import { listPlaylists, listSongs, listVideos } from '@/functions/playlists'
import { getOpenRun } from '@/functions/runs'

export const sessionQuery = queryOptions({
  queryKey: ['session'],
  queryFn: () => getSession(),
  staleTime: Infinity,
})

export const connectionsQuery = queryOptions({
  queryKey: ['connections'],
  queryFn: () => getConnections(),
})

export const developerTokenQuery = queryOptions({
  queryKey: ['developer-token'],
  queryFn: () => getDeveloperToken(),
  staleTime: Infinity,
})

export const playlistsQuery = queryOptions({
  queryKey: ['playlists'],
  queryFn: () => listPlaylists(),
  staleTime: 5 * 60_000,
})

export const videosQuery = (playlistId: string) =>
  queryOptions({
    queryKey: ['videos', playlistId],
    queryFn: () => listVideos({ data: { playlistId } }),
  })

export const songsQuery = (playlistId: string) =>
  queryOptions({
    queryKey: ['songs', playlistId],
    queryFn: () => listSongs({ data: { playlistId } }),
  })

export const runQuery = queryOptions({
  queryKey: ['run'],
  queryFn: () => getOpenRun(),
  // Poll while the server is still searching Apple Music.
  refetchInterval: (query) =>
    query.state.data?.matches.some((item) => item.status === 'searching')
      ? 1500
      : false,
})
