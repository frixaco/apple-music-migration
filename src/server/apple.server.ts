import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { appleConnection } from '@/db/schema'
import {
  AppleMusicClient,
  isFavoriteSongsPlaylist,
} from '@/lib/apple-music-client'
import type { AppleMusicArtwork } from '@/lib/apple-music-client'
import {
  generateDeveloperToken,
  loadDeveloperTokenConfig,
} from '@/lib/apple-music-developer-token'

let cachedToken: { token: string; expiresAt: Date } | undefined

/** A signed MusicKit developer token, renewed a day before it expires. */
export function developerToken(): string {
  if (!cachedToken || cachedToken.expiresAt.getTime() - Date.now() < 86_400_000) {
    cachedToken = generateDeveloperToken(loadDeveloperTokenConfig())
  }

  return cachedToken.token
}

const secret = () => process.env.BETTER_AUTH_SECRET!

/** Encrypts a Music User Token for storage, with the same secret Better Auth uses for Google tokens. */
export function encryptMusicUserToken(musicUserToken: string): Promise<string> {
  return symmetricEncrypt({ key: secret(), data: musicUserToken })
}

export function appleClient(musicUserToken: string): AppleMusicClient {
  return new AppleMusicClient({
    developerToken: developerToken(),
    musicUserToken,
  })
}

export function findAppleConnection(userId: string) {
  return db.query.appleConnection.findFirst({
    where: eq(appleConnection.userId, userId),
  })
}

export async function appleForUser(userId: string) {
  const connection = await findAppleConnection(userId)

  if (!connection) {
    throw new Error('Apple Music is not connected.')
  }

  return {
    client: appleClient(
      await symmetricDecrypt({ key: secret(), data: connection.musicUserToken }),
    ),
    storefront: connection.storefront,
  }
}

export function artworkUrl(
  artwork: AppleMusicArtwork | undefined,
  size: number,
): string | null {
  return artwork?.url.replace('{w}', String(size)).replace('{h}', String(size)) ?? null
}

/**
 * Adds catalog songs to Apple Music playlists. Favourite Songs can't be edited directly, so songs
 * are favourited instead, which puts them there.
 */
export async function addSongsToPlaylists(
  userId: string,
  catalogIds: string[],
  playlistIds: string[],
) {
  const { client } = await appleForUser(userId)
  const playlists = new Map(
    (await client.getAllLibraryPlaylists()).map((playlist) => [playlist.id, playlist]),
  )

  for (const playlistId of playlistIds) {
    const playlist = playlists.get(playlistId)

    if (playlist && isFavoriteSongsPlaylist(playlist)) {
      await client.addFavoriteSongs(catalogIds)
    } else {
      await client.addTracksToLibraryPlaylist(
        playlistId,
        catalogIds.map((id) => ({ id, type: 'songs' })),
      )
    }
  }

  return playlistIds.map((id) => playlists.get(id)?.attributes?.name ?? id)
}
