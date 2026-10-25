import '@/lib/zod-config'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { routeTree } from './routeTree.gen'

import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { getContext } from './integrations/tanstack-query/root-provider'

/**
 * Sets the security headers on each server response and returns a nonce for the page's inline
 * scripts. The Content Security Policy built on it only reports for now; once production shows
 * no violations, rename its header to Content-Security-Policy to enforce it. Vite's dev scripts
 * have no nonce, so dev skips the policy.
 */
const securityHeaders = createIsomorphicFn()
  .server(() => {
    setResponseHeader('Strict-Transport-Security', 'max-age=31536000')
    setResponseHeader('X-Content-Type-Options', 'nosniff')
    setResponseHeader('X-Frame-Options', 'DENY')
    setResponseHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    if (process.env.NODE_ENV !== 'production') return undefined
    const nonce = Buffer.from(
      crypto.getRandomValues(new Uint8Array(16)),
    ).toString('base64')
    setResponseHeader(
      'Content-Security-Policy-Report-Only',
      [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}' https://js-cdn.music.apple.com`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "connect-src 'self' https://*.apple.com",
        "frame-src 'self' https://*.apple.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    )
    return nonce
  })
  .client(() => undefined)

export function getRouter() {
  const context = getContext()

  const router = createTanStackRouter({
    routeTree,
    context,
    ssr: { nonce: securityHeaders() },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    // Playlist loaders call YouTube and Apple Music, which take seconds; show the route's
    // loading state almost at once instead of after the default second.
    defaultPendingMs: 150,
  })

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
