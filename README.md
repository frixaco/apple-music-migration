# Migrator

Web app for moving music between YouTube playlists and Apple Music: browse both libraries, search
Apple Music for YouTube videos, review the matches and add them to Apple Music playlists, or move
videos between YouTube playlists.

TanStack Start + React, TanStack Query, shadcn/ui on Tailwind, Better Auth (email and Google),
Drizzle on Postgres.

## Layout

- `src/routes` pages, `src/functions` server functions, `src/server/*.server.ts` server-only code
  (YouTube and Apple Music clients, matching runs)
- `src/lib` shared code: `matching.ts` scores Apple Music candidates for a video,
  `apple-music-client.ts` wraps the Apple Music API
- `src/components/ui` shadcn components, restyled to the design tokens in `src/styles.css`
- `src/db` Drizzle schema, `drizzle/` migrations
- `scripts/` one-off Bun scripts

## Setup

Copy `.env.example` to `.env` and fill it in (MusicKit key, Google OAuth web client, Postgres).

```sh
bun install
bun run db:migrate
bun run dev   # http://localhost:3000
```

## Scripts

Scripts run with Bun, read `.env` and can import anything under `src` through `@/`. Use
`appleForUser` and `youtubeForUser` from `src/server` to get API clients for a user's connected
accounts; see `scripts/list-playlists.ts`.

```sh
bun scripts/list-playlists.ts you@example.com
```

## Deploy

Pushing to `main` deploys to Railway (project `migrator`, service `web`, config in
`.railway/railway.ts`). Migrations run before each deploy.
