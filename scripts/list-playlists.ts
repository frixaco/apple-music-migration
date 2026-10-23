// Example script: prints a user's YouTube and Apple Music playlists. Read-only.
// Usage: bun scripts/list-playlists.ts you@example.com
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { user } from '@/db/schema'
import { appleForUser } from '@/server/apple.server'
import { youtubeForUser } from '@/server/youtube.server'

const email = process.argv[2]
const found = email
  ? await db.query.user.findFirst({ where: eq(user.email, email) })
  : undefined
if (!found) throw new Error('Usage: bun scripts/list-playlists.ts <email>')

const { client } = await appleForUser(found.id)
for (const playlist of await client.getAllLibraryPlaylists()) {
  console.log(`AM  ${playlist.attributes?.name}`)
}

const youtube = await youtubeForUser(found.id)
for (const playlist of await youtube.listPlaylists()) {
  console.log(`YT  ${playlist.title} (${playlist.count})`)
}

process.exit(0)
