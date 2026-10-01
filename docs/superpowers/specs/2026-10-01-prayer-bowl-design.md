# Prayer Bowl — Plan 4 Design

**Date:** 2026-10-01
**Status:** Draft design, pre-implementation
**Parent spec:** [2026-07-02-small-group-pwa-design.md](2026-07-02-small-group-pwa-design.md) — the data model, feature behaviors, and edge cases live there and are not restated here. This document records what plan 4 builds, where the parent spec and the Hearth mockups disagree, and the decisions neither of them settles.

## Goal

Ship the second weekly ritual: everyone puts one prayer request in the bowl, the group draws, and each person carries home exactly one request — never their own — with the writer's name only if they signed it.

## Scope

**In:**

- **The bowl on the meeting page.** Join, write one request (with an "include my name" toggle), edit or take it back out until the draw, see who is in by name only, and draw.
- **The draw.** A server-side derangement over submitters, inside one transaction, behind a guarded `open → drawn` transition.
- **After the draw.** Each submitter sees the one request they drew.
- **My prayers.** The `/prayers` tab replaces its "coming soon" placeholder with every request you've drawn, week by week.
- **E2E smoke** for the full flow — the parent spec's "run a prayer session end-to-end".

**Out:**

- Private notes → plan 5. The meeting page gains the prayer section only.
- Leaving the bowl once joined ("I'm out"). Not in the spec or the mockups.
- Meetings-list row summaries ("Prayer gathering", "Tacos · 4 of 6 claimed") shown in the flow walkthrough. Neither plan 3 nor plan 4 builds them.
- Undoing or re-running a draw. The parent spec makes the drawn bowl the meeting's permanent record.

## Where the spec and the mockups disagree

The Hearth mockups (3g, 3n, 3h, 3l) are final for look and copy; the parent spec is final for behavior. They conflict in three places.

1. **Starting the bowl.** The spec says "any member starts a session"; the mockups have no start screen — every meeting's bowl simply shows *Open*. **Resolution:** the bowl starts itself. No session row exists until the first member joins or writes, and that member is recorded as `started_by`. The spec's rule holds (a member started it) and no screen the mockups lack is added. Page renders never write.
2. **"I'm in".** The spec requires an "I'm in" button; the mockups never show one. But mockup 3n shows a *Waiting on* bucket, and only an explicit join without a request can put someone there. **Resolution:** a member who hasn't joined sees the buckets and an **I'm in** button; joining takes them to the compose form (3g); writing takes them to the gathering view (3n). Submitting still joins you, as the spec says.
3. **"6 people in".** Mockup 3n's caption reads "6 people in · you'll each draw one request" while two of those six are still *Waiting on*. Under the spec only submitters draw, so the caption would promise two people a request they won't get. **Resolution:** the number is the **submitted** count. The confirm dialog names anyone still writing and says they won't be included.

## Decisions this plan makes

1. **Viewer stages.** Per viewer, an open bowl is one of: *not joined* (buckets + I'm in + Draw), *composing* (3g form only), *submitted* (3n buckets + Draw + Edit my request). A drawn bowl shows 3h.
2. **Badge.** *Open* while no request is in, *Gathering* once at least one is, *Drawn · {meeting date}* after. The meeting's date-only value is used, not `drawn_at`, which avoids the timezone and hydration problem `formatMeetingDate` exists to prevent.
3. **"Include my name" defaults off.** Signing is an affirmative act ("like signing the paper"). Mockup 3g renders the toggle on, but that frame shows someone mid-compose with text and a cursor — it reads as their choice, not the default.
4. **Privacy is enforced in the domain, not the UI.** The read model never returns another member's request text before the draw; after it, only the one request assigned to the viewer, with the author's name only if they signed it — and no author id at all. These reads check membership themselves, a deliberate exception to this codebase's "reads don't self-authorize" convention: a leak here is the feature's one unforgivable failure.
5. **Polling uses `router.refresh()`, not SWR.** The parent spec says "SWR revalidation every few seconds", but SWR needs a GET endpoint to fetch from — an API layer the same spec rules out ("no separate API layer for CRUD") — and would add a second data-fetching model beside server components. A client component calling `router.refresh()` every 5 seconds while the bowl is open delivers the same behavior on the existing architecture, the same mechanism `RefreshOnFocus` uses. It pauses while the tab is hidden and stops once the bowl is drawn.
6. **Submissions serialize with the draw.** Join, write, edit, and withdraw take a `FOR SHARE` lock on the bowl's row and check it is still open; the draw flips status with `UPDATE … WHERE status = 'open'`. Postgres makes those two lock modes conflict, so a request either makes the draw or is refused as `session-closed` — never left stranded, unassigned, in a drawn bowl.
7. **The draw skips people no longer in the group.** A member removed after writing would be assigned a request they can never open, and their own would reach someone else. Only current members' requests are drawn.
8. **Every derangement is equally likely.** Fisher–Yates shuffle, retried until nothing maps to itself (about 2.7 shuffles on average, at any group size). Sattolo's algorithm avoids the retry but only ever produces a single cycle — for four people, 6 of the 9 valid draws, never the two-pairs-swap ones. That structural bias is avoided.
9. **One bowl per meeting, keyed by meeting.** `prayer_sessions.meeting_id` is the primary key, as `meal_plans.meeting_id` already is; the child tables key on `meeting_id`.
10. **Withdrawing keeps you joined.** You move back to *Waiting on*. No confirm: it's recoverable until the draw by writing again.
11. **Requests are 1–1,000 characters** after trimming.
12. **My prayers is scoped to the active group,** like the Meetings and Recipes tabs.
13. **Deleting a meeting** now names the prayer bowl in its warning, since the bowl cascades with it.

## Architecture

Plan 3's layering, unchanged.

- **Tables:** `prayer_sessions`, `prayer_participants`, `prayer_requests`, `prayer_assignments` — parent spec's data model, with `meeting_id` as the bowl key (decision 9). Uniqueness the spec requires lives in the database: one request per author per bowl; one assignment per request and per assignee.
- **Domain:** `src/lib/derangement.ts` (pure) and `src/lib/prayers.ts`, taking explicit actor ids and using the shared guards in `src/lib/membership.ts`.
- **Error vocabulary additions:** `session-closed` (any write after the draw), `too-few-requests` (drawing with fewer than two). A draw that loses a race is a no-op, not an error.
- **Actions** in `src/app/(app)/prayers/actions.ts`, thin as before.

**Permissions:**

| Action | Who |
|---|---|
| Join; write, edit, or withdraw your own request | Any member |
| Draw | Any member |
| Read your own request | You |
| Read the request you drew | You, after the draw |
| Read anyone else's request text | Nobody |

## Screens and copy

| Route | Screen |
|---|---|
| `/meetings/[id]` | prayer portion of **3g** (compose), **3n** (gathering), **3h** (drawn) |
| `/prayers` | **3l** My prayers |

**Copy from the mockups, verbatim:** "Prayer bowl" · "Open" · "Gathering" · "Drawn · Jul 9" · "The bowl is open. Write a request — it stays sealed until everyone draws." · "Include my name" · "Put it in the bowl" · "You can edit or remove it until the draw" · "Submitted" · "Waiting on" · "Not joined" · "Draw the bowl" · "{n} people in · you'll each draw one request" · "YOU DREW" · "— {name}" · "Carry this with you through the week." · "See all my prayers ›" · "My prayers" · "Requests you've drawn, week by week" · "THIS WEEK · JUL 9" · "Name not shared".

**New copy, not in the mockups — please review:**

| Where | Copy |
|---|---|
| Not-joined button | I'm in |
| Submitted, edit link | Edit my request |
| Compose, editing | Update my request · Take it out of the bowl |
| Fewer than two requests | The bowl can be drawn once two requests are in. |
| Draw confirm | **Draw the bowl?** {n} requests are in — each of you will draw one, never your own. {names} is/are still writing and won't be included. Nothing can be changed afterwards. · Cancel · Draw the bowl |
| Drawn, you didn't write | The bowl has been drawn. You didn't put a request in this time. |
| My prayers, empty | **Nothing drawn yet** · When your group draws the prayer bowl, the request you draw lands here. |
| Errors | The bowl has already been drawn. · The bowl needs at least two requests before anyone can draw. · Write your request first. · Keep it under 1,000 characters. |

## Mobile-first requirements

The parent spec's [Mobile-first experience](2026-07-02-small-group-pwa-design.md#mobile-first-experience) section is binding.

- **Joining and writing are optimistic.** Your own stage — and your name's bucket — moves on tap and reconciles when the server answers. The draw shows a pending state instead: its result only exists once the server has computed it.
- **Fresh while open.** The bowl polls every 5 seconds while open and refetches on focus, so names arrive without anyone pulling to refresh.
- **The request field stays usable.** ≥16px text (mockup 3g's 15px yields to the iOS zoom rule), and it scrolls clear of the fixed tab bar when focused.
- **Names and requests wrap,** never truncate.
- **The draw resists fat fingers.** It can't be undone, so its confirm keeps Cancel focused and nearest the top, with the draw at the far end — the same rule as the delete confirms.

## Testing

- **Vitest unit:** the derangement — a permutation with no fixed points for every size from 2 to 40; two people always swap; and every derangement of four reached, which separates a uniform sampler from Sattolo's.
- **Vitest integration:** presence and buckets; one request per author; request text never readable by another member before the draw; the drawn view withholding an unsigned author's name; fewer than two requests refused with the bowl left open; non-submitters and removed members left out; every write refused once drawn; **concurrent draws — exactly one happens**; **a request submitted during a draw is drawn or refused, never stranded.**
- **Playwright smoke:** two members fill the bowl, one draws, and each sees the other's request — with two people the draw is a swap, so the assertion is deterministic.

Each contention test is confirmed to fail against the broken implementation it guards against before it is trusted (plan 3 task 7's lesson: its contention test, as first written, passed against the implementation it was meant to reject).
