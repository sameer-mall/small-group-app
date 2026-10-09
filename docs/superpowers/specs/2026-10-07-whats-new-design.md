# What's New — Design

> **Update 2026-10-08:** the What's new card and list moved with the other personal controls to the Settings screen (`/settings`, `/settings/whats-new`), reached by the gear on the Group screen. See `2026-10-07-push-notifications-design.md`. References to the Group screen below describe the original placement.

**Date:** 2026-10-07
**Status:** Implemented
**Parent spec:** [2026-07-02-small-group-pwa-design.md](2026-07-02-small-group-pwa-design.md). This feature isn't in the parent spec; it adds an app-wide channel for telling members what changed.

## Goal

Members don't follow the repo, so a feature they'd use (editing their name, the bowl's new rule) can ship and go unnoticed. After each user-facing release, the next time a member opens the app they see a short popup of what's new since they last looked, once. Every past entry stays readable from the Group screen.

## Scope

**In:**

- **Release notes in code.** A hand-written list of entries in `src/lib/whats-new.ts`, added in the same PR as the feature it describes.
- **Per-account "seen" tracking.** One number on the user row, so the popup shows once per person, not once per device or browser.
- **The popup** on the first app open after a release, listing the unseen entries.
- **A What's new list** at `/group/whats-new`, reached from a card on the Group screen.
- **Launch recap.** Three entries covering PRs #65 to #68, so existing members get one popup at launch.
- **A CLAUDE.md convention** so user-facing PRs add their entry.

**Out:**

- Admin-only or per-group entries. Everyone sees every entry; an admin-only change says "Group admins can now…".
- Images, screenshots, or rich text in entries.
- An editor UI, a database table of entries, or entries generated from PR titles or labels.
- Push notifications or email announcements.
- "New" badges or dots on the tab bar or the Group card.
- Re-showing an entry after its wording is edited.

## Decisions this design makes

1. **The trigger is opening the app, not signing in.** Better Auth sessions here last 7 days and renew on every use, so a member who opens the app weekly never sees the sign-in screen. The popup fires on the first `(app)` page rendered after a release they haven't seen.
2. **Ids, not dates, decide what's unseen.** Each entry has an integer `id` that only goes up and is never reused. A member's `whatsNewSeen` is the highest id they've dismissed; unseen means `id > whatsNewSeen`. Dates are display-only. (Comparing a dismissal timestamp against date-only entry dates would hide a release shipped later on the same day the member last dismissed.)
3. **The number lives on the user row as a Better Auth additional field.** `whatsNewSeen` is declared in `src/lib/auth.ts` under `user.additionalFields` with `input: false`, so no client call can set it, then regenerated into `src/db/auth-schema.ts` (never hand-edited) and migrated. Sessions read the user row on every request (no cookie cache), so `requireUser()` already returns it and the `(app)` layout pays no extra query. A separate app table would add a query to every page, and iOS cold starts are already the app's slowest path.
4. **Existing members start at 0; new accounts start caught up.** The column is `integer NOT NULL DEFAULT 0`, so the migration leaves every existing member at 0 and they see the launch recap once. A Better Auth `databaseHooks.user.create.before` hook sets `whatsNewSeen` to the latest id for every new account, whatever the sign-up path (emailed code or Google). New members never get a backlog.
5. **Any way of closing marks it seen.** "Got it", the X, tapping outside, Escape, and "See all updates" all count, or the popup would nag. The dialog closes at once; the save happens in the background.
6. **The save only moves forward.** The action sends the newest id the popup showed. The domain write sets `whats_new_seen = GREATEST(whats_new_seen, id)`, clamping `id` to the latest id in code, so a stale tab can't un-see newer entries and no client can skip future ones.
7. **A failed save is silent.** No error shows; the popup comes back on the next open, which is the right outcome. The action still calls `logRefusal(err)` first in its refusal mapping, per CLAUDE.md.
8. **The dialog doesn't reopen on its own props.** The `(app)` layout persists across client navigation, and `RefreshOnFocus` can re-render it before the save commits, handing the dialog the same unseen list again. The dialog keeps a `dismissedThrough` id in state and is open only while the newest unseen id is greater than it. A later deploy with a higher id can still open it in the same session.
9. **No revalidation after the save.** The dialog's own state keeps it closed, and the next server render reads the saved value.
10. **The popup shows at most 3 entries.** Newest first. With more than 3 unseen (someone away all summer), it shows the newest 3 and a **See all updates** button that goes to the list and also marks everything seen.
11. **The content is checked by a test, not by zod.** Entries are code, not outside input, so CLAUDE.md's zod rule doesn't apply. A Vitest guard test enforces the shape instead (see Testing).
12. **The entries module stays pure.** `src/lib/whats-new.ts` has no database or server imports, so the layout, the list page, and tests can all read it cheaply. The database write lives with the other user-row writes in `src/lib/profile.ts`.

## Architecture

- **Column:** `user.whats_new_seen integer NOT NULL DEFAULT 0`, from the regenerated `auth-schema.ts` plus a drizzle migration (`mise run db:generate`).
- **Auth config** (`src/lib/auth.ts`): `user.additionalFields.whatsNewSeen` (`type: "number"`, `required: true`, `input: false`, `defaultValue: 0`; `required` is what makes the generated column `NOT NULL`) and a `databaseHooks.user.create.before` hook that sets it to `LATEST_RELEASE_ID`.
- **Content and pure logic** (`src/lib/whats-new.ts`):
  - `type Release = { id: number; date: string; title: string; body: string }`, with `date` as `YYYY-MM-DD`.
  - `releases: Release[]`, newest first: a new entry goes at the top.
  - `LATEST_RELEASE_ID`, which is `releases[0].id`.
  - `unseenReleases(seen: number): Release[]`, the entries with `id > seen`, newest first.
  - `POPUP_LIMIT = 3`.
  - `whatsNewPopup(seen)`, the popup's props: the first `POPUP_LIMIT` unseen entries, `newestId` (0 when there's nothing), and `hasMore`.
- **Domain write** (`src/lib/profile.ts`): `markWhatsNewSeen(userId, releaseId)`, a forward-only update clamped to `LATEST_RELEASE_ID`. It throws `Error("not-found")` if the user row is gone, like `updateDisplayName`.
- **Action** (`src/app/(app)/group/actions.ts`, next to the display-name action): `markWhatsNewSeenAction(releaseId)`. It requires a signed-in user, validates the id with zod (a positive integer), and calls the domain write. It returns nothing the UI shows.
- **Layout** (`src/app/(app)/layout.tsx`): always mounts `<WhatsNewDialog {...whatsNewPopup(user.whatsNewSeen)} />`, so its dismissed state survives the layout re-rendering. The dialog stays shut when there's nothing unseen.
- **UI:**
  - `WhatsNewDialog` (client, `src/components/whats-new-dialog.tsx`) on the existing `Dialog`.
  - `WhatsNewCard` (`src/components/whats-new-card.tsx`) on the Group screen.
  - `/group/whats-new` (`src/app/(app)/group/whats-new/page.tsx`), a server-rendered list. It sits under `/group`, so the Group tab stays lit.
- **Dates** are formatted as calendar dates with no timezone conversion, like meeting dates.

## Screens and copy

- **The popup.** The existing centered dialog, like Report a problem, with its close button. The title is **What's new**, with the line "Here's what changed since you last looked." under it. Each entry shows its short date ("Oct 5"), its title in semibold, and its body. When more than 3 entries are unseen, a **See all updates** outline button links to `/group/whats-new`. At the bottom is a full-width **Got it** primary button.
- **Group screen card.** A tappable card directly under Appearance, styled like the other Group cards. It has an uppercase **What's new** label, the latest entry's title, and its date, with a chevron. The whole card links to `/group/whats-new`, like the note and meeting cards, so it joins the button-styling guard test's allow-list.
- **What's new page.** Laid out like My notes: the heading **What's new** and the subtitle "The latest changes to the app", then one card per entry, newest first. Each card shows the date with year ("Oct 5, 2026"), the title, and the body. There's no back link, matching every other page; the lit Group tab leads back. The entry list is never empty: launch ships with three entries.

**Rules for writing entries** (the guard test enforces the mechanical ones):

- One entry per change a member would notice. Skip invisible work (speed-ups, refactors) unless members can feel it.
- Written from the member's side ("You can now…"), one or two sentences, with no PR numbers or jargon.
- No em dashes (owner's copy rule since PR #54).
- New entries go at the top with the next id. Never reuse or renumber an id. Fixing an entry's wording after it ships is fine and won't show it again.

**Launch entries** (the owner may tweak the wording; ids and order are fixed):

| id | date | title | body |
|---|---|---|---|
| 3 | 2026-10-05 | The prayer bowl waits for everyone | The bowl can't be drawn until everyone who's in has written a request. Joined by mistake? Tap I'm out to leave the bowl. |
| 2 | 2026-10-05 | Change your name anytime | Made a typo when you signed up? Tap Edit name on the Group screen to change how your name shows to your group. |
| 1 | 2026-10-05 | Smoother on iPhone | The app opens to a splash screen instead of a black screen, and buttons, dialogs, and date fields fit small screens better. |

**CLAUDE.md** gains a Conventions line: user-facing changes add an entry at the top of `src/lib/whats-new.ts` in the same PR, written for members, with the next id.

## Testing

- **Content guard** (Vitest, `src/lib/whats-new.test.ts`): ids are unique positive integers, strictly decreasing down the list; every `date` is a real `YYYY-MM-DD`; every title and body is non-empty after trimming; no title or body contains an em dash; `LATEST_RELEASE_ID` equals the first entry's id.
- **Unit:** `unseenReleases` with seen at 0, in the middle, at the latest, and above the latest (a rolled-back deploy shows nothing). `whatsNewPopup` with more than 3 unseen, exactly 3, and none. `releaseIdInput` rejects anything but a positive whole number.
- **Integration** (Postgres):
  - `markWhatsNewSeen` moves forward, ignores a lower id, and clamps an id above the latest.
  - A user created through Better Auth starts at `LATEST_RELEASE_ID`.
  - A row inserted with the column omitted starts at 0.
- **E2E** (Playwright, port 3300):
  1. Sign up a member, then set their `whats_new_seen` to 0.
  2. Load the app: the popup shows the three launch entries.
  3. Tap **Got it**: the popup closes.
  4. Reload: there's no popup.
  5. From Group, open What's new: all three entries are listed.

  Existing E2E specs sign up through the real code flow, so their accounts start caught up and the popup never covers their screens.
