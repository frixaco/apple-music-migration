import type { Playlist, Service } from './types'

export const serviceName: Record<Service, string> = {
  youtube: 'YouTube',
  apple: 'Apple Music',
}

/** Identifies a playlist across both services. */
export function playlistKey(playlist: Pick<Playlist, 'service' | 'id'>): string {
  return `${playlist.service}:${playlist.id}`
}

/** Apple Music only accepts additions to playlists the app may edit, and to Favourite Songs. */
export function canAddTo(playlist: Playlist): boolean {
  return playlist.canEdit || playlist.isFavorites
}

/** Link options for a playlist's page. */
export function playlistRoute(playlist: Pick<Playlist, 'service' | 'id'>) {
  return playlist.service === 'youtube'
    ? ({ to: '/youtube/$playlistId', params: { playlistId: playlist.id } } as const)
    : ({ to: '/apple/$playlistId', params: { playlistId: playlist.id } } as const)
}
