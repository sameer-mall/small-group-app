# Small Group PWA

Church small-group app: weekly meal sign-ups, anonymous-draw prayer requests, private meeting notes. Multi-group.

- **Spec:** docs/superpowers/specs/2026-07-02-small-group-pwa-design.md
- **Plans:** docs/superpowers/plans/ (execute in order)

## Commands (all via mise)

- `mise run dev` — dev server
- `mise run db:up` — local Postgres (Docker, required before tests)
- `mise run test` — Vitest unit + integration
- `mise run e2e` — Playwright smoke
- `mise run lint` / `typecheck` / `build`

## Conventions

- Trunk-based: feature branch → PR → main (main = production on Vercel).
- All DB access through `src/db/client.ts` (Drizzle). Schema in `src/db/schema.ts`.
- Mobile-first UI: Tailwind + shadcn/ui.
- Visual design: "Hearth" theme — Tailwind-ready tokens and screen notes in docs/design/hearth/ (high fidelity; recreate faithfully).
- The theme blocks in src/app/globals.css are a HAND-COPY of docs/design/hearth/theme.css — no automated sync. After editing theme.css, re-paste its `:root` / `[data-theme]` / `@theme inline` blocks into globals.css.
- Production: https://small-group-app-beta.vercel.app (Vercel, personal account; GitHub repo sameer-mall/small-group-app).
