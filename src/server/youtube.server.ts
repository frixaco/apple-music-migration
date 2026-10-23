import { and, desc, eq, like } from 'drizzle-orm'
import { db } from '@/db'
import { account } from '@/db/schema'
import { auth } from '@/lib/auth'
import { youtubeScope } from '@/lib/youtube'
import type { Video } from '@/lib/types'
import { chunks } from '@/lib/util'

const apiOrigin = 'https://www.googleapis.com/youtube/v3'

type Page<T> = { items?: T[]; nextPageToken?: string }

type Thumbnails = Partial<
  Record<'default' | 'medium' | 'high', { url: string }>
>

type PlaylistResource = {
  id: string
  snippet: { title: string }
  contentDetails: { itemCount: number }
}

type PlaylistItemResource = {
  id: string
  snippet: {
    title: string
    description: string
    position: number
    publishedAt: string
    videoOwnerChannelTitle?: string
    thumbnails?: Thumbnails
    resourceId: { videoId: string }
  }
}

type VideoResource = { id: string; contentDetails: { duration: string } }

/** The newest Google account the user linked with YouTube access. */
export async function findYouTubeAccount(userId: string) {
  return db.query.account.findFirst({
    where: and(
      eq(account.userId, userId),
      eq(account.providerId, 'google'),
      like(account.scope, `%${youtubeScope}%`),
    ),
    orderBy: desc(account.updatedAt),
  })
}

export async function youtubeForUser(userId: string): Promise<YouTubeClient> {
  const youtubeAccount = await findYouTubeAccount(userId)

  if (!youtubeAccount) {
    throw new Error('YouTube is not connected.')
  }

  // Better Auth refreshes the access token when it has expired.
  const { accessToken } = await auth.api.getAccessToken({
    body: { accountId: youtubeAccount.id, userId },
  })

  return new YouTubeClient(accessToken)
}

export class YouTubeClient {
  constructor(private readonly accessToken: string) {}

  async listPlaylists() {
    const playlists = await this.getAllPages<PlaylistResource>('/playlists', {
      part: 'snippet,contentDetails',
      mine: 'true',
    })

    return playlists.map((playlist) => ({
      id: playlist.id,
      title: playlist.snippet.title,
      count: playlist.contentDetails.itemCount,
    }))
  }

  async listVideos(playlistId: string): Promise<Omit<Video, 'match'>[]> {
    const items = await this.getAllPages<PlaylistItemResource>(
      '/playlistItems',
      { part: 'snippet', playlistId },
    )
    const durations = await this.getDurations(
      items.map((item) => item.snippet.resourceId.videoId),
    )

    return items.map(({ id, snippet }) => ({
      playlistItemId: id,
      videoId: snippet.resourceId.videoId,
      position: snippet.position + 1,
      title: snippet.title,
      channel: snippet.videoOwnerChannelTitle ?? '',
      durationSeconds: durations.get(snippet.resourceId.videoId) ?? null,
      thumbnailUrl:
        snippet.thumbnails?.high?.url ?? snippet.thumbnails?.medium?.url ?? null,
      description: snippet.description,
      addedAt: snippet.publishedAt,
    }))
  }

  async addVideo(playlistId: string, videoId: string): Promise<void> {
    await this.request('POST', '/playlistItems', { part: 'snippet' }, {
      snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } },
    })
  }

  async removePlaylistItem(playlistItemId: string): Promise<void> {
    await this.request('DELETE', '/playlistItems', { id: playlistItemId })
  }

  /** Adds videos to a playlist, removing each from its source playlist when moving. */
  async sendVideos(
    targetPlaylistId: string,
    items: Array<{ videoId: string; playlistItemId: string }>,
    removeFromSource: boolean,
  ): Promise<void> {
    for (const item of items) {
      await this.addVideo(targetPlaylistId, item.videoId)
      if (removeFromSource) await this.removePlaylistItem(item.playlistItemId)
    }
  }

  async createPlaylist(title: string): Promise<string> {
    const playlist = await this.request<{ id: string }>(
      'POST',
      '/playlists',
      { part: 'snippet,status' },
      { snippet: { title }, status: { privacyStatus: 'private' } },
    )

    return playlist.id
  }

  private async getDurations(videoIds: string[]): Promise<Map<string, number>> {
    const durations = new Map<string, number>()

    for (const ids of chunks(videoIds, 50)) {
      const page = await this.request<Page<VideoResource>>('GET', '/videos', {
        part: 'contentDetails',
        id: ids.join(','),
      })

      for (const video of page.items ?? []) {
        durations.set(video.id, parseIsoDuration(video.contentDetails.duration))
      }
    }

    return durations
  }

  private async getAllPages<T>(
    path: string,
    params: Record<string, string>,
  ): Promise<T[]> {
    const items: T[] = []
    let pageToken: string | undefined

    do {
      const page: Page<T> = await this.request<Page<T>>('GET', path, {
        ...params,
        maxResults: '50',
        ...(pageToken ? { pageToken } : {}),
      })
      items.push(...(page.items ?? []))
      pageToken = page.nextPageToken
    } while (pageToken)

    return items
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    params: Record<string, string>,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(
      `${apiOrigin}${path}?${new URLSearchParams(params)}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    )
    const text = await response.text()

    if (!response.ok) {
      throw new Error(`YouTube API ${method} ${path} failed: ${response.status} ${text}`)
    }

    return (text ? JSON.parse(text) : undefined) as T
  }
}

/** Converts an ISO 8601 duration such as PT1H2M3S to seconds. */
function parseIsoDuration(value: string): number {
  const match = value.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  const [days = 0, hours = 0, minutes = 0, seconds = 0] = (match?.slice(1) ?? []).map(
    (part: string | undefined) => (part ? Number(part) : 0),
  )

  return ((days * 24 + hours) * 60 + minutes) * 60 + seconds
}
