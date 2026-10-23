import { createAuthClient } from 'better-auth/react'
import { youtubeScope } from './youtube'

export const authClient = createAuthClient()

/** Sends the user to Google to grant YouTube access; any Google account can be picked. */
export function connectYouTube() {
  return authClient.linkSocial({
    provider: 'google',
    scopes: [youtubeScope],
    callbackURL: '/connect',
  })
}
