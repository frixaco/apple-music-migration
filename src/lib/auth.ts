import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { db } from '@/db'
import * as schema from '@/db/schema'

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Offline access so the YouTube connection keeps working after the access token expires.
      accessType: 'offline',
      prompt: 'select_account consent',
    },
  },
  account: {
    // Google access and refresh tokens are encrypted at rest with BETTER_AUTH_SECRET.
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      // The YouTube account may be a different Google account than the one used to sign in.
      allowDifferentEmails: true,
      trustedProviders: ['google'],
    },
  },
  plugins: [tanstackStartCookies()],
})

export type Session = typeof auth.$Infer.Session
