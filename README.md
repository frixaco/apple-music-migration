# YouTube to Apple Music Migration

Workspace for migrating the public YouTube playlist to Apple Music.

## Current Input

- Raw YouTube metadata: `data/raw/youtube_playlist_raw.json`
- Clean video list: `data/raw/youtube_playlist_videos.csv`
- Expected video count: `703`
- Target Apple Music destination: Favorite Songs
- Preserve source playlist order: yes

## Web app (Migrator)

TanStack Start + React app for moving videos between YouTube playlists and Apple Music.
Routes are in `src/routes`, server functions in `src/functions`, server-only code in
`src/server/*.server.ts`, and shadcn components in `src/components/ui`. The Bun scripts
below share matching and the Apple Music client with it through `src/lib`.

```sh
bun run dev          # http://localhost:3000; needs Postgres at DATABASE_URL (.env)
bun run db:migrate   # apply drizzle/ migrations
bun run typecheck && bun run lint && bun run build
```

Deployed on Railway (project `migrator`, service `web`); see `.railway/railway.ts`.

## Scripts

```sh
bun run check
```

Verifies the raw playlist manifest count, empty rows, duplicate video IDs, and basic first/last entry details.

## User Actions Needed Now

1. Confirm Apple Music storefront/region, currently assumed to be `us`.
2. Provide Apple Music API access:
   - Preferred: put `APPLE_MUSIC_DEVELOPER_TOKEN` and `APPLE_MUSIC_USER_TOKEN` in `.env`.
   - Alternative: provide Apple Developer MusicKit key material locally so we can generate the developer token.
   - Current key material still needs `APPLE_TEAM_ID`.
3. Confirm matching strictness:
   - exact song only
   - allow remixes/live/acoustic
   - allow covers
   - prefer music video vs song when both exist
4. Confirm whether Favorite Songs is mandatory even if Apple controls its final sorting.

## Apple Music Destination Note

Apple documents that favoriting a song adds it to the user's Favorite Songs playlist. That is different from appending tracks to a normal editable playlist. If exact order in Apple Music is mandatory, we need to verify whether Favorite Songs preserves insertion order for your account; otherwise the order-preserving destination should be a normal library playlist.
