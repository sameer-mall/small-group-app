# Small Group PWA — Design Spec

**Date:** 2026-07-02
**Status:** Approved design, pre-implementation

## Purpose

A PWA for church small groups that replaces three manual weekly rituals:

1. **Meal sign-ups** — a saved recipe library ("Tacos" = meat, rice, chips…) where members claim individual items for the week's meal.
2. **The prayer bowl** — everyone types a prayer request; when the group is ready, requests are randomly assigned so nobody draws their own.
3. **Discussion notes** — private per-member notes tied to each meeting.

The app is multi-group from day one so other groups in the church can adopt it.

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (latest stable), App Router, TypeScript, Turbopack |
| Database (prod) | Neon Postgres (Vercel marketplace) |
| Database (local) | Postgres in Docker with a named volume (`docker-compose.yml` in repo) |
| ORM / migrations | Drizzle |
| Auth | Better Auth with the organization plugin |
| Transactional email | Resend (magic-link sign-in emails; free tier) |
| UI | Tailwind CSS + shadcn/ui, mobile-first |
| PWA | Serwist via `@serwist/turbopack` (manifest, service worker, app-shell caching) |
| Tooling | mise (`mise.toml` pins Node + pnpm, defines tasks); pnpm for JS dependencies |
| Hosting | Vercel |
| Testing | Vitest (unit + integration), Playwright (e2e smoke) |

Notes:

- Mutations are Next.js server actions; there is no separate API layer for CRUD.
- The prayer session screen polls (SWR revalidation every few seconds). No websockets in v1 — for a room of ~10 people, polling is indistinguishable from realtime.
- The same pinned Postgres major version is used locally and on Neon. Drizzle migrations run against both.
- minimal.dev was evaluated and skipped for v1: it overlaps with mise (declarative tools + tasks) and its sandboxing/hermetic-build focus isn't needed here. It's early-access; revisit later if desired.
- mise tasks (at minimum): `dev`, `db:up`, `db:migrate`, `test`, `e2e`.

## Visual design — "Hearth" theme

- **Design reference:** the "Hearth" handoff from Claude Design. **High-fidelity — colors, type, spacing, radii, and copy are final; recreate faithfully.** The repo vendors only the distilled parts: `docs/design/hearth/theme.css` (tokens) and `docs/design/hearth/README.md` (screen inventory + interaction notes). The full HTML mockups (screens 3a–3n, dark reference 2a, flow walkthrough) stay in the Claude Design project and the original export zip — deliberately not committed.
- **Tokens:** `docs/design/hearth/theme.css` is the source of truth, written as Tailwind v4 CSS (`@theme inline`). Pasted into `globals.css` it themes every shadcn component (via `--color-primary`, `--color-background`, …) and generates Hearth utilities (`bg-surface-tint`, `text-accent-strong`, `rounded-card`, `shadow-card`, `min-h-tap`) — screens are styled with plain Tailwind classes, warm cream (`#FAF5EC`) + terracotta (`#C4693F`), 44px minimum tap targets.
- **Typography:** Lora (headings, meeting/recipe titles, prayer-quote text) + Public Sans (body), loaded via `next/font` (self-hosted at build, not the Google Fonts CDN — required for offline PWA and no layout shift).
- **Dark mode:** warm brown, never gray/black, with ember terracotta (`#D98A5C`) for links/active states. Switched via `data-theme="dark"` on `<html>`, following `prefers-color-scheme` by default.

## Auth, groups & membership

- Sign-in: **email magic link** and **Google**. No passwords.
- Every user has a **display name**, required on first sign-in (prefilled from Google when available) — the UI runs on names everywhere: claims, prayer buckets, avatar initials.
- Better Auth organizations = groups. Roles: `admin`, `member`. A group can have multiple admins.
- **Open sign-up:** anyone can create an account, invite or not. After sign-in, a user with group memberships lands in their group (last active group if several); a user with none lands on a no-group home with a **create a group** button (creator becomes admin) and a note that joining an existing group happens via an invite link from its admin.
- Users can belong to multiple groups; the UI has an active-group switcher.
- **Joining:** each group has an invite link (rotating code). A new user follows the link, signs in, and lands as a **pending join request**. An admin approves or denies. Rotating the link only invalidates the old URL for new joiners — existing members and pending requests are unaffected.
- **Leaving:** any member can leave a group. A group must always have **at least one admin**: the last admin can't be demoted, removed, or leave without promoting someone first.
- Pending status is **per group**: the requested group shows a "waiting for approval" state, but the user can still use other groups they belong to — or create their own.
- **Admin capabilities:** approve/deny join requests, remove members, promote members to admin, rename the group, rotate the invite link.
- **Authorization rule:** every query and mutation is scoped by group membership, enforced server-side in a shared data-access layer — never trusted from the client.

## Data model

Better Auth owns `users`, `sessions`, `organizations` (groups), `members`, and invitations. App tables (all group-scoped directly or via their parent):

- `join_requests` — user, group, status (`pending` / `approved` / `denied`).
- `meetings` — group, **title**, **date**, created_by. Created manually by any member (no auto-creation). The meeting is the hub that the meal plan, prayer session, and notes hang off. Creator or an admin can edit/delete a meeting; deletion warns that its content goes with it.
- `recipes` — group, name, created_by. Any member can create/edit/delete recipes via the recipe library UI.
- `recipe_items` — recipe, label (e.g. "2 lbs ground beef", "chips — 2 bags"), position. Items are sized for the group when the recipe is written.
- `meal_plans` — zero or one per meeting (none until someone sets the meal), chosen recipe, set_by.
- `meal_plan_items` — **copies** of the recipe's items made when the recipe is loaded, plus **ad-hoc items** added later (label, position, source: `recipe` / `adhoc`, added_by). Copying means later recipe edits never rewrite past weeks.
- `item_claims` — meal_plan_item → user. **Unique constraint on meal_plan_item** (one claimer per item). No cap on claims per person.
- `prayer_sessions` — meeting, started_by, status (`open` / `drawn`), drawn_by, drawn_at. One active session per meeting.
- `prayer_participants` — session, user (unique pair). "I'm in" list.
- `prayer_requests` — session, author, body, include_name (bool). **Unique (session, author)** — one request per person per session.
- `prayer_assignments` — session, request, assignee. Unique per (session, assignee) and per request. Derangement guarantees assignee ≠ author.
- `notes` — meeting, author, body. **Unique (meeting, author)** — one private note per member per meeting.

## Features

### Meetings

Any member creates a meeting with a title and date ("Week 12 — Romans 8", July 9). Dates are date-only (no time-of-day — the group knows when they meet), and nothing prevents two meetings in the same week. The app lists upcoming and past meetings; opening one shows its meal plan, prayer session, and your note.

### Recipes & meal sign-ups

- **Recipe library:** create a recipe with a name and an ordered list of items; edit and delete later. Group-scoped.
- **Weekly plan:** any member sets the meeting's meal by picking a recipe. Its items are copied into the plan as claimable slots.
- **Claiming:** tap an unclaimed item to claim it; tap your own claim to release it. One person per item; one person may claim many items. Everyone sees who's bringing what.
- **Ad-hoc items:** any member can add extra items to the week's plan (e.g. "brownies"), labeled with who added them, claimable like any other. They exist on that plan only — the saved recipe is untouched. The adder or an admin can remove an ad-hoc item while it's unclaimed.
- **Changing the recipe** after claims exist warns, then clears the plan (items and claims) and loads the new recipe's items.

### Prayer bowl

- Any member starts a session for a meeting. **One session per meeting, total** — after the draw it remains as that meeting's permanent record; no second bowl for the same night.
- **Presence:** opening the session shows an "I'm in" button. The screen shows three buckets: submitted ✓, in-the-session-but-still-typing (who we're waiting on), and members who haven't joined (grayed out). Submitting auto-joins you. Request contents are never shown — only names, like watching people fold paper.
- **Submitting:** one request per person, with an "include my name" toggle (author's choice, like signing the paper). Editable/deletable until the draw. Submissions lock once drawn.
- **Draw:** any member can tap Draw, behind a confirm dialog showing the participant count. Requires ≥ 2 requests. The server computes a **derangement** (random permutation with no fixed points) over submitters only, inside a single transaction with a guarded `open → drawn` status transition — a second concurrent Draw no-ops.
- **After the draw:** each submitter sees the request they drew, with the author's name only if the author opted in.
- **My Prayers:** a view listing every request the user has drawn across all sessions, newest first, with week/date context — so past weeks stay prayable.

### Notes

One private note per member per meeting. Freeform text, autosaved. A "my notes" history lists them by meeting.

## Error handling & edge cases

- **Claim race:** DB unique constraint wins; the loser sees "already claimed" and a refreshed list.
- **Draw race:** transactional status transition; second tap no-ops.
- **Draw with < 2 requests:** blocked with a message.
- **Submission after draw:** blocked — the session is closed.
- **Absent member:** simply doesn't join/submit; excluded from the draw.
- **Pending/removed users:** server-side membership checks gate every read and write.

## Testing

- **Vitest unit:** derangement (no self-assignment, everyone assigned, n = 2…N), pure domain logic.
- **Vitest integration:** claim uniqueness under contention and draw transaction behavior, against the Docker Postgres.
- **Playwright smoke:** the three main flows — set a meal & claim items, run a prayer session end-to-end, write a note.

## CI/CD

- **CI — GitHub Actions**, one workflow on every PR and push to `main`:
  - `jdx/mise-action` installs Node + pnpm from `mise.toml`, so CI runs the exact tool versions pinned for local dev.
  - Jobs: ESLint → `tsc --noEmit` → Vitest unit + integration → `next build`. Integration tests run against a Postgres **service container** (same image/version as local Docker).
  - A second job runs the Playwright smoke suite against the built app, on every PR.
- **Branching:** trunk-based. `main` is the only long-lived branch and deploys to production; work happens on short-lived feature branches merged via PR. No `staging` branch — Vercel's per-PR preview deployments serve that role.
- **Branch protection on `main`:** all changes via PRs; CI checks required to merge.
- **CD — Vercel Git integration** (no deploy YAML): preview deployment per PR, production deploy on merge to `main`. Neon's per-preview database branching is a possible later addition.
- **Dependabot** for automated dependency-update PRs, validated by CI.
- **Code review:** CI checks only — no automated review bot. Local `/code-review` before pushing as desired.

## External accounts & secrets

| Service | Account needed? | When | Credential |
|---|---|---|---|
| Vercel | Yes — free Hobby, sign up with GitHub | Plan 1, final task (first deploy) | None locally; Git integration handles deploys |
| Neon | No separate account — provisioned via Vercel Marketplace | Plan 2 (first prod DB use) | `DATABASE_URL` auto-injected into Vercel env |
| Better Auth | **No account — it's a library** | Plan 2 | `BETTER_AUTH_SECRET`, generated locally |
| Google Cloud | Yes — free; OAuth client for "Sign in with Google" | Plan 2 | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` |
| Resend | Yes — free tier (100 emails/day) | Plan 2 (magic-link emails) | `RESEND_API_KEY` |

**Resend domain requirement:** sending magic links to real members in production requires a **verified sending domain** in Resend (test mode only delivers to the account owner's inbox). Plan on owning a domain (~$10–20/yr) by the time plan 2 ships — it doubles as the app's custom domain.

**Secrets handling rule:** credentials go from the provider's dashboard directly into `.env` (gitignored) locally and into Vercel's environment settings for deploys — entered by the account owner. They are never committed, and never pasted into chat sessions.

## Out of scope for v1

- Push notifications (PWA architecture leaves room; nothing built).
- Websockets/realtime infra (polling instead).
- Church-wide group directory (invite links only).
- Item quantities / multi-person claims per item.
- Multiple prayer requests per person per session.
- Saving ad-hoc items back into the recipe.
- Group deletion (leave/remove covers v1; a dead group just goes quiet).
- minimal.dev adoption.
