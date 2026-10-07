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
- Auth: Better Auth (`src/lib/auth.ts`); group operations live in `src/lib/groups.ts` behind DAL guards (`src/lib/dal.ts`) — server actions stay thin.
- Validation: zod (v4) for input from outside the code, on the server. Server actions parse their `FormData` with a zod schema (`schema.safeParse(...)`, returning `form.error.issues[0].message` as the inline error, so schema messages are user-facing copy). Server env vars are validated once in `src/lib/env.ts`: read them from `env`, not `process.env` (except `NEXT_PUBLIC_*` in modules the browser imports). Derive types from schemas with `z.infer` instead of restating them. Keep zod out of `"use client"` components and browser-shipped modules (e.g. `src/lib/sentry-config.ts`) so it stays out of the client bundle.
- Push notifications: `src/lib/push.ts` is the transport (subscriptions, `sendToUsers`), `src/lib/notifications.ts` has one `notify*` function per event, taking ids only. Server actions schedule them with `after()` once the save has succeeded; never await a push in the request. Copy and recipients are tested in `src/lib/notifications.test.ts` and `tests/integration/notifications.test.ts`.
- Monitoring: Sentry, configured in `src/lib/sentry-config.ts` (plan 6). Nothing sent to Sentry may contain user content (prayer requests, notes, names, emails, sign-in codes): ids and codes only. Server action files call `logRefusal(err)` (`src/lib/monitoring.ts`) first thing in their refusal mapping.
