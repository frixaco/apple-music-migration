export type AppleMusicPage<T> = {
  data?: T[]
  next?: string
  meta?: { total?: number }
}

export type AppleMusicArtwork = {
  url: string
  width?: number
  height?: number
}

export type AppleMusicPlaylist = {
  id: string
  type: 'library-playlists'
  attributes?: {
    name?: string
    canEdit?: boolean
    dateAdded?: string
  }
  relationships?: {
    tracks?: AppleMusicPage<AppleMusicTrack>
  }
}

export type AppleMusicTrack = {
  id: string
  type: string
  attributes?: {
    name?: string
    artistName?: string
    albumName?: string
    durationInMillis?: number
    artwork?: AppleMusicArtwork
    playParams?: {
      catalogId?: string
      id?: string
      isLibrary?: boolean
      kind?: string
    }
  }
}

export type AppleMusicCatalogResource = {
  id: string
  type: 'songs' | 'music-videos'
  attributes?: {
    name?: string
    artistName?: string
    albumName?: string
    durationInMillis?: number
    url?: string
    artwork?: AppleMusicArtwork
  }
}

export type AppleMusicCatalogSearchResponse = {
  results?: Partial<
    Record<'songs' | 'music-videos', AppleMusicPage<AppleMusicCatalogResource>>
  >
}

export type AppleMusicPlaylistCreationRequest = {
  attributes: {
    name: string
    description?: string
  }
  relationships?: {
    tracks?: {
      data: Array<{
        id: string
        type: string
      }>
    }
  }
}

const appleMusicApiOrigin = 'https://api.music.apple.com'

export class AppleMusicClient {
  private readonly developerToken: string
  private readonly musicUserToken: string

  constructor(options: { developerToken: string; musicUserToken: string }) {
    this.developerToken = options.developerToken
    this.musicUserToken = options.musicUserToken
  }

  async getAllLibraryPlaylists(): Promise<AppleMusicPlaylist[]> {
    return this.getAllPages<AppleMusicPlaylist>('/v1/me/library/playlists')
  }

  async getAllLibraryPlaylistTracks(
    playlistId: string,
  ): Promise<AppleMusicTrack[]> {
    const path = `/v1/me/library/playlists/${playlistId}/tracks?limit=100`
    try {
      // The first page gives the total, so the rest load in parallel instead of following `next`.
      const first = await this.get<AppleMusicPage<AppleMusicTrack>>(path)
      const items = first.data ?? []
      const offsets: number[] = []
      for (
        let offset = items.length;
        offset < (first.meta?.total ?? 0);
        offset += 100
      )
        offsets.push(offset)
      const rest = await Promise.all(
        offsets.map((offset) =>
          this.get<AppleMusicPage<AppleMusicTrack>>(`${path}&offset=${offset}`),
        ),
      )
      return items.concat(...rest.map((page) => page.data ?? []))
    } catch (error) {
      if (String(error).includes('"code":"40403"')) {
        return []
      }

      throw error
    }
  }

  async getStorefront(): Promise<string> {
    const response = await this.get<{ data?: Array<{ id: string }> }>(
      '/v1/me/storefront',
    )
    const storefront = response.data?.[0]?.id

    if (!storefront) {
      throw new Error('Apple Music returned no storefront for this account.')
    }

    return storefront
  }

  async getLibraryPlaylistTrackCount(playlistId: string): Promise<number> {
    try {
      const page = await this.get<AppleMusicPage<AppleMusicTrack>>(
        `/v1/me/library/playlists/${playlistId}/tracks?limit=1`,
      )
      return page.meta?.total ?? page.data?.length ?? 0
    } catch (error) {
      if (String(error).includes('"code":"40403"')) {
        return 0
      }

      throw error
    }
  }

  async createLibraryPlaylist(
    request: AppleMusicPlaylistCreationRequest,
  ): Promise<AppleMusicPlaylist> {
    const response = await this.post<{ data?: AppleMusicPlaylist[] }>(
      '/v1/me/library/playlists',
      request,
    )
    const playlist = response.data?.[0]

    if (!playlist) {
      throw new Error(
        'Apple Music created a playlist but returned no playlist data.',
      )
    }

    return playlist
  }

  async addTracksToLibraryPlaylist(
    playlistId: string,
    tracks: Array<{ id: string; type: string }>,
  ): Promise<void> {
    await this.post(`/v1/me/library/playlists/${playlistId}/tracks`, {
      data: tracks,
    })
  }

  /** Favouriting a catalog song adds it to the Favourite Songs playlist, which cannot be edited directly. The endpoint accepts one id per request. */
  async addFavoriteSongs(catalogSongIds: string[]): Promise<void> {
    for (const id of catalogSongIds) {
      await this.post(
        `/v1/me/favorites?ids[songs]=${encodeURIComponent(id)}`,
        undefined,
      )
    }
  }

  async deleteLibrarySongRating(librarySongId: string): Promise<void> {
    await this.delete(
      `/v1/me/ratings/library-songs/${encodeURIComponent(librarySongId)}`,
    )
  }

  async searchCatalog(options: {
    storefront: string
    term: string
    types: Array<'songs' | 'music-videos'>
    limit?: number
  }): Promise<AppleMusicCatalogSearchResponse> {
    const searchParams = new URLSearchParams({
      term: options.term,
      types: options.types.join(','),
      limit: String(options.limit ?? 25),
    })

    return this.get<AppleMusicCatalogSearchResponse>(
      `/v1/catalog/${encodeURIComponent(options.storefront)}/search?${searchParams}`,
    )
  }

  private async getAllPages<T>(path: string): Promise<T[]> {
    const items: T[] = []
    let nextPath: string | undefined = path

    while (nextPath) {
      const currentPath = nextPath
      const page: AppleMusicPage<T> =
        await this.get<AppleMusicPage<T>>(currentPath)
      items.push(...(page.data ?? []))
      nextPath = page.next
    }

    return items
  }

  private async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path)
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body)
  }

  private async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path)
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = path.startsWith('http') ? path : `${appleMusicApiOrigin}${path}`
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.developerToken}`,
        'Music-User-Token': this.musicUserToken,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const responseBody = await response.text()

    if (!response.ok) {
      throw new Error(
        `Apple Music API request failed: ${response.status} ${responseBody}`,
      )
    }

    if (!responseBody) {
      return undefined as T
    }

    return JSON.parse(responseBody) as T
  }
}

export function isFavoriteSongsPlaylist(playlist: AppleMusicPlaylist): boolean {
  const name = playlist.attributes?.name?.toLowerCase()
  return name === 'favorite songs' || name === 'favourite songs'
}
