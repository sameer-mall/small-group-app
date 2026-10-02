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

Sign-in supports Google OAuth and passwordless emailed 6-digit codes (Better Auth's email-OTP plugin, `src/lib/auth.ts`). Codes, not magic links: a link opens in the phone's browser, which on iOS keeps a separate cookie jar from the installed PWA, so the home-screen app never got the session. In production, code emails are sent via Resend from `signin@send.sameermall.com`. In local dev, no `RESEND_API_KEY` is set, so the email transport falls back to the console — the code is printed to the terminal running `mise run dev` instead of being sent.

## Error monitoring

Errors, problem reports, and a few logs go to Sentry (personal account, free plan). Setup and decisions: `docs/superpowers/plans/2026-10-01-06-error-monitoring.md`. Sentry is off unless `NEXT_PUBLIC_SENTRY_DSN` is set, which only Vercel does. Never put it in `.env` or `.env.local`.

When someone reports a problem:

- **They sent a reference code** (from an error screen): search Sentry Issues for `ref:<code>`. The event has a replay. If it has a `digest` tag, search `digest:<value>` for the server's issue with the full stack.
- **They used Report a problem** (Group tab): it's under User Feedback, with their message, name, email, a replay starting a minute before they opened it, and their user id. Search Issues and Logs by that id.
- **"My code never came":** a refused send is an issue (and an email to you) tagged `area:sign-in-email`. Each accepted send is a log, `Sign-in code email sent`, with Resend's id; delivery status is in the Resend dashboard.
- **"It said I couldn't do that":** Logs, `Action refused`, filtered by their user id. `reason` is the refusal code.

Every event carries the user's id only. A replay masks all text. Nothing sent to Sentry may contain prayer requests, notes, names, emails, or codes. The one exception is a report the member writes themselves.

## Workflow

Trunk-based: feature branch → PR → green CI (`checks` + `e2e`) → merge to `main` → Vercel deploys production automatically. Every PR gets a Vercel preview deployment.
