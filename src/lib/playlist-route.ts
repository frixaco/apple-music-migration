import type { Playlist } from './types'

/** Link options for a playlist's page. */
export function playlistRoute(playlist: Pick<Playlist, 'service' | 'id'>) {
  return playlist.service === 'youtube'
    ? ({ to: '/youtube/$playlistId', params: { playlistId: playlist.id } } as const)
    : ({ to: '/apple/$playlistId', params: { playlistId: playlist.id } } as const)
}
