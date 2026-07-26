# Small Group

Church small-group PWA: weekly meal sign-ups, anonymous-draw prayer requests, and private meeting notes. Multi-group by design.

**Production:** https://small-group-app-beta.vercel.app

## How it's built

- Next.js 16 (App Router, Turbopack), TypeScript, Tailwind CSS v4 + shadcn/ui
- Postgres via Drizzle — Docker locally, Neon in production
- Serwist PWA ("Hearth" design system — see docs/design/hearth/)
- Spec: docs/superpowers/specs/2026-07-02-small-group-pwa-design.md
- Plans: docs/superpowers/plans/ (executed in order)

## Development

Requires [mise](https://mise.jdx.dev) and Docker.

```bash
mise install       # pinned Node + pnpm
pnpm install
mise run db:up     # local Postgres (Docker, named volume)
mise run dev       # dev server
mise run test      # Vitest unit + integration (needs db:up)
mise run build     # production build
mise run e2e       # Playwright smoke (needs build)
```

Also: `mise run lint`, `mise run typecheck`, `mise run db:generate`, `mise run db:migrate`. Run `mise run db:generate` after any schema change (`src/db/schema.ts`) to produce a new Drizzle migration in `drizzle/`.

## Auth

Sign-in supports Google OAuth and passwordless email magic links (Better Auth, `src/lib/auth.ts`). In production, magic-link emails are sent via Resend from `signin@send.sameermall.com`. In local dev, no `RESEND_API_KEY` is set, so the email transport falls back to the console — the magic link is printed to the terminal running `mise run dev` instead of being sent.

## Workflow

Trunk-based: feature branch → PR → green CI (`checks` + `e2e`) → merge to `main` → Vercel deploys production automatically. Every PR gets a Vercel preview deployment.
