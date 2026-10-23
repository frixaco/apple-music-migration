# Agent guide

See README.md for the layout, setup and deploy.

## Rules

- Never write to the user's real YouTube or Apple Music accounts while developing or verifying
  (adding, moving, removing, favouriting, creating playlists) unless the user asks for it. Reads and
  Apple Music catalog searches are fine.
- `src/lib/matching.ts` must keep producing the same results; the original migration depends on it.
  When you touch it, compare its output over all videos in `data/raw/youtube_playlist_raw.json`
  against the previous commit.
- Use shadcn components for UI. Add missing ones with `npx shadcn@latest add <name>` and restyle
  them in `src/components/ui`; don't hand-roll what shadcn ships. The CLI writes a broken
  `import { cn } from "cn"`; change it to `@/lib/utils`.
- Async state goes through TanStack Query (`src/lib/queries.ts`, mutations with `meta.invalidates`).
- Server-only code lives in `src/server`; server functions in `src/functions`
  stay thin.
- Never commit `.env`, `secrets/` or `*.p8`. Tokens in the database are encrypted with
  `BETTER_AUTH_SECRET`.
- Pushing to `main` deploys to production on Railway. Railway project `main` hosts many unrelated
  services; only touch the `migrator` service and the `migrator` database.

## Checks

```sh
bun run typecheck && bun run lint && bun run build && bun run check
```

ESLint skips `src/components/ui` (vendored shadcn) and the top-level scripts in `src/*.ts`.
Check UI changes in a browser with `bun run dev` (local Postgres database `migrator`).
