# Prayer wall (replaces the prayer bowl)

**Status:** draft for review · 2026-11-22
**Supersedes:** the open/draw parts of `2026-10-01-prayer-bowl-design.md`
**Screens:** Claude Design canvas "Prayer wall redesign" (https://claude.ai/artifact/Fo1qF5iZ6Z5ktYZkqRvPrX), artboards 1–4 and A–C. Hearth tokens throughout; recreate faithfully.

## Why

The bowl hides every request until a random draw, so nobody sees what the group is carrying until the night is over, and most of the group only ever reads one request. The group wants to see requests as they come in, and still leave each person with one specific request to pray for during the week.

## What changes for members

1. **A shared wall.** Each meeting has a prayer wall. Every member of the group sees every request on it, with the author's name and photo, newest first, as they are posted.
2. **Names always show.** The "Include my name" toggle is removed. Posting means posting under your name.
3. **Assign prayers** replaces **Draw the bowl.** When the group is done posting, any member taps Assign prayers. Everyone who posted gets one request to pray for, never their own. Who got whose stays private: you see only your own assignment, and on your own request, "Someone in the group is praying for this".
4. **The wall locks once assigned** and stays readable as that week's record.
5. **"I'm in" / "I'm out" go away.** Posting a request is how you take part.

## Decisions

| # | Decision | Why |
|---|----------|-----|
| 1 | **Every existing request becomes visible on its meeting's wall, with the author's name, past drawn bowls included.** No migration of request data, no legacy view. | Chosen for least work (option 2 in review). Accepted consequence: requests written as unsigned under the bowl's "sealed" promise become readable by the group. Mitigated only by the What's new entry (below). |
| 2 | **Keep the data model.** `prayer_sessions`, `prayer_requests`, `prayer_assignments` are reused; no new table. | The model already fits: one request per author per meeting, one assignment per assignee, guarded `open → drawn` transition. |
| 3 | `prayer_sessions.status` keeps the values `open` / `drawn`; in code and copy `drawn` means **assigned**. Columns `drawn_by` / `drawn_at` keep their names. | Avoids a rename migration. A comment on the schema records the meaning. |
| 4 | **Drop** `prayer_requests.include_name` and the `prayer_participants` table in one migration. | Both are dead after decisions 1 and 5; leaving them invites code to read them. Their data has no further use. |
| 5 | Assign needs **at least 2 requests**, and no longer waits on anyone. Members who have not posted get no assignment. | The "still writing" gate existed only because of "I'm in". The confirm sheet names who hasn't posted, so the person assigning can wait for them. |
| 6 | Any member can assign (unchanged from draw). | Matches today; small groups self-organise. |
| 7 | Edit and delete your own request until assigned; after that, nothing changes. | Unchanged from the bowl. |
| 8 | Only requests from **current** group members are shown or assigned. | Unchanged rule from the draw; also stops a removed member's words staying on the wall. |
| 9 | The wall is **its own page**: `/meetings/[id]/prayers`. The meeting page keeps a preview card. | Agreed on the canvas; the wall gets long. |
| 10 | **One new push**, on assign, to each assignee: "Prayers are assigned", body "You're praying for {author}'s request this week." Opens the wall page. **No push per post.** | A push per post would be noisy in a group of 10; the wall refreshes while open. |

## Screens

### Home (`/`) — artboard A
The meeting row gains a chip when its wall has requests: `Prayer wall · N requests` (accent-tint pill). `listMeetings` gains `prayerRequestCount`: a left-joined count of the meeting's requests from current group members. No chip at 0.

### Meeting page (`/meetings/[id]`) — artboards B, C
`PrayerSection` becomes a preview card linking to the wall:
- **Open:** title "Prayer wall", count pill, the two newest requests (avatar + body clamped to 2 lines), a line `+ N more · You haven't posted yet` (second half only when true), and a primary **Open the prayer wall** button.
- **Assigned:** pill `Assigned · {meeting date}` (success-tint), "You're praying for", the request body, "From {name}", and a secondary pill **See the whole wall ›**. If the viewer had no assignment: "Prayers were assigned. You didn't post this time." plus the same pill.
- **Empty:** "No requests yet. Be the first to share one." plus the button.

### Prayer wall (`/meetings/[id]/prayers`) — artboards 1–4
Page title "Prayer wall", subtitle "{meeting title} · {short date}". Back pill goes to the meeting (journey parent; label "Meeting").
- **Not posted (1):** "Share a request" textarea (1000 chars, required) with hint "Your name shows with it. Everyone in the group can see the wall." and primary **Post to the wall**. Feed of requests below.
- **Posted (2):** compose form hidden; the viewer's request is first, tinted, with an **Edit** pill (opens the textarea prefilled, with **Save** and a destructive **Delete my request**).
- Feed rows: `<Avatar>`, name, relative time ("2 min ago", from `updated_at`), body in Lora, wrapping, never truncated.
- Under the feed: `Not posted yet: {names}` (current members without a request; "You" first), then **Assign prayers** (outline until the viewer has posted, primary after) with caption `N people posted · you'll each get one to pray for`. Under 2 requests: caption "Prayers can be assigned once two requests are in." and no button.
- **Confirm sheet (3):** title "Assign prayers?", "{N} requests are on the wall. Everyone who posted gets one to pray for this week, never their own." A tinted callout when anyone hasn't posted: "{names} hasn't/haven't posted. They can still see the wall, but won't get a prayer this week." Then "The wall locks once prayers are assigned. Nothing can be edited afterwards." Cancel (outline, autofocus) then **Assign prayers** (primary).
- **Assigned (4):** "You're praying for" block (as the old drawn view, name always shown) then "Everyone's requests", the full feed, read-only. The viewer's own request carries "Someone in the group is praying for this" (success colour). No other assignment information is rendered or sent to the client.
- `RefreshWhileOpen` stays on the wall page while status is open, so new posts appear.

### My prayers (`/prayers`)
Unchanged structure. Subtitle "Requests you've been assigned, week by week"; empty state "When your group assigns prayers, the one you get lands here." Author name always shown.

## Server

`src/lib/prayers.ts` (DAL guards unchanged; every read checks membership itself):

- `postPrayerRequest(userId, meetingId, body)` — upsert own request while open (replaces join + submit). Creates the session on first post as today.
- `deletePrayerRequest(userId, meetingId)` — replaces withdraw.
- `assignPrayers(userId, meetingId)` — today's `drawPrayerBowl` minus the participants check. Same guarded UPDATE, same current-member filter, same `derangement`. Errors: `too-few-requests`.
- `getPrayerWall(viewerId, meetingId)` → `{ status, requests: {id, authorId, name, image, body, updatedAt, isMine}[], notPosted: {userId, name}[], mine: {body} | null, assigned: {body, authorName, authorImage} | null, myRequestIsAssigned: boolean }`. Requests from current members only, newest first. **Never returns assignee ids** for anything but the viewer's own assignment.
- The meeting card reuses `getPrayerWall` and takes the newest two, the count, whether the viewer posted, and their assignment. No separate preview query (groups are small).
- `listMyDrawnPrayers` → rename `listMyAssignedPrayers`; drop the `includeName` masking.
- Removed: `joinPrayerBowl`, `leavePrayerBowl`, `withdrawPrayerRequest`, `submitPrayerRequest`, `getPrayerBowl`, `BowlMember`/`PrayerBowl` types.

`src/app/(app)/prayers/actions.ts`: `postPrayerRequestAction`, `deletePrayerRequestAction`, `assignPrayersAction`, each zod-parsed, `logRefusal(err)` first in refusal mapping, and `revalidatePath` for the wall, the meeting and `/`. Assign schedules `notifyPrayersAssigned({ actorId, meetingId })` with `after()`.

`src/lib/notifications.ts`: `prayersAssignedCopy` + `notifyPrayersAssigned`, recipients = assignees minus the actor, url `inGroup(groupId, /meetings/{id}/prayers)`, tag `prayers-{meetingId}`. Body includes only the author's name (no request text in a push).

`src/lib/journey.ts`: `parentOf("/meetings/x/prayers")` → `/meetings/x`; labels unchanged (meeting already labels "Meeting").

Migration (drizzle, next number): `ALTER TABLE prayer_requests DROP COLUMN include_name; DROP TABLE prayer_participants;`.

## Components

New: the route `src/app/(app)/meetings/[id]/prayers/page.tsx`, `prayer-wall-feed`, `prayer-post-form`, `assign-prayers-button` (from `draw-bowl-button`), `prayer-preview-card`, `you-are-praying-for` (from `drawn-prayer-bowl`).
Removed: `open-prayer-bowl`, `prayer-buckets`, `prayer-compose` (folded into `prayer-post-form`), `draw-bowl-button`, `drawn-prayer-bowl`.
All buttons through `Button` / `buttonVariants` (guard test). No em dashes in any copy.

## Privacy and monitoring

- The wall is group-visible by design; the guarantees that remain are: only current members of the meeting's group can read it (checked in `getPrayerWall`), and assignment pairs are never exposed beyond the viewer's own.
- Sentry: unchanged rule, ids and error codes only. No request text, names, or counts tied to names.

## What's new

Entry id 7, at the top of `src/lib/whats-new.ts`:
- Title: "The prayer bowl is now a prayer wall"
- Body: "Everyone in your group can now see prayer requests as they come in, with names, including past weeks. When you're done sharing, tap Assign prayers and each of you gets one to pray for."

## Testing

- `tests/integration/prayers.test.ts` rewritten around post / edit / delete / assign: only members read the wall; removed members' requests disappear; assign needs 2; nobody gets their own; concurrent assigns produce one set; the wall returns no assignee ids except the viewer's; posting after assign is refused.
- `src/lib/notifications.test.ts` + `tests/integration/notifications.test.ts`: assign push copy and recipients (assignees minus actor), url points at the wall.
- `journey` unit test: wall's parent is its meeting.
- `e2e/prayers.spec.ts`: two members post, both see both on the wall, one assigns, each sees the other's request under "You're praying for"; home chip count; meeting preview card links to the wall. Update `meals.spec.ts` / `display-name.spec.ts` where they touch the bowl.

## Out of scope

Per-post push notifications, reactions or comments on requests, more than one request per person, admin removal of someone else's request (see the deferred bowl admin-remove design), and reassigning after assignment.
