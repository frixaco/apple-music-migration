import { redirect } from '@tanstack/react-router'
import { createMiddleware } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from '@/lib/auth'

/** Adds the signed-in user to a server function's context, or sends the visitor to sign in. */
export const authMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() })

    if (!session) {
      throw redirect({ to: '/sign-in' })
    }

    return next({ context: { user: session.user } })
  },
)
