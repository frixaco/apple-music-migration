# Agent guide

See README.md for the layout, setup, deploy and Apple Music API notes.

## Rules

- Never write to the user's real YouTube or Apple Music accounts while developing or verifying
  (adding, moving, removing, favouriting, creating playlists) unless the user asks for it. Reads and
  Apple Music catalog searches are fine. In the browser, only change selection or view state; never
  press Add, Move, Copy, Remove, Find & add or Create while testing.
- When the user does ask for account writes: snapshot the affected playlist first (under
  `.amp/in/`), write, then re-read the playlist to confirm. A cancelled run may already have applied
  most of its writes.
- `src/lib/matching.ts` must keep producing the same results; the original migration depends on it.
  When you touch it, compare its output over all videos in `data/raw/youtube_playlist_raw.json`
  against the previous commit (kept as a fixture for this). New comparison logic goes next to it
  (e.g. `src/lib/compare.ts`), not inside it.
- Changes to `src/lib/compare.ts` may only add title variants or raise scores. Before and after,
  record labels and rankings for real playlist pairs in both directions and diff them: no lost
  matches, downgrades or reordered top matches.
- Matches are always reviewed by the user, even at confidence 5. Candidates are `songs`, never
  music videos. A cover, remix or slowed edit is not a match for its original.
- Use shadcn components for UI. Add missing ones with `npx shadcn@latest add <name>` and restyle
  them in `src/components/ui`; don't hand-roll what shadcn ships. The CLI writes a broken
  `import { cn } from "cn"`; change it to `@/lib/utils`.
- Shared list UI lives in `src/components/list-layout.tsx`. Every list says which playlist it shows
  (`PlaylistHeader`). Don't add elements that don't earn their place: no raw IDs, no repeated
  information, plain labels, no decorative colour. Check desktop and mobile (390×844).
- Long lists stay virtualised (`VirtualRows`); rows are memoised and set `data-index` and the measure
  ref, which drag selection relies on.
- Pages whose loader waits on YouTube or Apple Music need a pending component (`ListPending`,
  `HomePending`).
- Async state goes through TanStack Query (`src/lib/queries.ts`, loaders use `ensureQueryData`,
  mutations use `meta.invalidates` and `meta.success`). Don't add refetches: YouTube calls cost quota.
- Server-only code lives in `src/server`; server functions in `src/functions` stay thin.
  `src/routeTree.gen.ts` and `src/db/auth-schema.ts` are generated; don't edit them by hand.
- Never commit `.env`, `secrets/` or `*.p8`. Tokens in the database are encrypted with
  `BETTER_AUTH_SECRET`. The repository is public.
- Pushing to `main` deploys to production on Railway, so push only when the user says so ("deploy"
  counts). Railway project `main` hosts many unrelated services; only touch the `migrator` service
  and the `migrator` database, and never create a new Railway project.
- Commit messages are one plain sentence, with an `Amp-Thread-ID:` trailer.

## Checks

```sh
bun run typecheck && bun run lint && bun run build
```

Format changed files with Prettier (`bun run format` formats everything). ESLint skips
`src/components/ui` (vendored shadcn). One-off scripts go in `scripts/` (scratch ones as
`scripts/tmp-*.ts`, deleted afterwards) and reuse `src/server` for API clients; the local user is
`test@migrator.local`.

## Browser checks

Check UI changes in a browser with `bun run dev` on port 3000 (local Postgres database `migrator`);
`BETTER_AUTH_URL` sends other ports back to 3000. Stop dev servers you started when done. To find
the server, use `lsof -nP -iTCP:3000 -sTCP:LISTEN -t`; plain `lsof -ti :3000` also lists browser
processes. Work in your own tab and leave the user's tabs alone. If Vite throws "Invalid hook call"
after a dependency change, restart with `bun run dev -- --force`.
