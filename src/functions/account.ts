import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { appleConnection } from '@/db/schema'
import { auth } from '@/lib/auth'
import type { Connections } from '@/lib/types'
import {
  appleClient,
  developerToken,
  encryptMusicUserToken,
  findAppleConnection,
} from '@/server/apple.server'
import { authMiddleware } from '@/server/auth-middleware'
import { findYouTubeAccount } from '@/server/youtube.server'

export const getSession = createServerFn().handler(async () => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  return session ? { user: session.user } : null
})

export const getConnections = createServerFn()
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Connections> => {
    const [youtubeAccount, apple] = await Promise.all([
      findYouTubeAccount(context.user.id),
      findAppleConnection(context.user.id),
    ])
    return {
      youtube: youtubeAccount
        ? { email: idTokenEmail(youtubeAccount.idToken) }
        : null,
      apple: apple
        ? { storefront: apple.storefront, connectedAt: apple.connectedAt }
        : null,
    }
  })

/** MusicKit JS needs the developer token in the browser to ask the user for a Music User Token. */
export const getDeveloperToken = createServerFn()
  .middleware([authMiddleware])
  .handler(() => developerToken())

export const connectApple = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ musicUserToken: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const storefront = await appleClient(data.musicUserToken).getStorefront()
    const values = {
      userId: context.user.id,
      musicUserToken: await encryptMusicUserToken(data.musicUserToken),
      storefront,
      connectedAt: new Date(),
    }

    await db
      .insert(appleConnection)
      .values(values)
      .onConflictDoUpdate({ target: appleConnection.userId, set: values })
  })

export const disconnectApple = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await db
      .delete(appleConnection)
      .where(eq(appleConnection.userId, context.user.id))
  })

/** Reads the email claim from the Google ID token saved when YouTube was linked. */
function idTokenEmail(idToken: string | null): string | null {
  const payload = idToken?.split('.')[1]
  if (!payload) return null
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
    email?: string
  }
  return claims.email ?? null
}
