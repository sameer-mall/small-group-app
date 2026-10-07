# Push notifications and a Settings screen

**Date:** 2026-10-07
**Status:** approved in brainstorming; implemented by the plan of the same date
**Parent spec:** `2026-07-02-small-group-pwa-design.md`, which listed push as out of scope for v1 ("PWA architecture leaves room; nothing built")

## Goal

A member who has installed the app and turned notifications on hears about
the things that otherwise go unnoticed until the next time they open it:

- a meeting was created
- a meal was set for a meeting
- a recipe was added
- someone asked to join the group (admins only)
- their own request to join was approved (that person only)

One on/off toggle per device. No per-event preferences, no email or SMS
fallback, no scheduled reminders in this cut (see "Planned follow-on").

The personal controls that today sit on the Group screen (display name,
appearance, report a problem, sign out) move to a new Settings screen, reached
by a gear in the Group header, and the notifications toggle joins them there.

## Decisions made in brainstorming

| Question | Decision |
|---|---|
| Delivery mechanism | Web Push with the `web-push` package, sent from the server action in Next's `after()`. No outbox table, no hosted service. |
| Events | The five above. Prayer bowl ready, item claimed, and request denied are out. |
| Preferences | A single toggle, per device. "On" means a subscription row exists for this device. |
| Where the toggle lives | A new `/settings` page, reached by a gear icon in the Group screen header. No hamburger menu, no new tab. |
| Discovery | None beyond the gear. A Home screen nudge card was considered and cut. |
| Copy | Full sentences with the actor's name (table below). |
| Stale subscriptions | The server deletes a subscription when a push bounces 404 or 410. The client toggle reflects what the browser holds, so a reinstalled app shows "off" and the member taps again. No silent re-subscribe. |

### Why not a hosted push service

The fiddly parts of this feature (the iOS Home Screen requirement, the
one-shot permission prompt, the service worker handlers, the toggle states)
are the same with or without a vendor. What a vendor replaces is a send loop
of about fifty lines. In exchange it adds an account to keep alive, a script in
the client bundle that often brings its own service worker, and member
identifiers plus notification text leaving the app's infrastructure. The
project has been careful about exactly that. If a later feature needs
scheduling, retries, or multi-channel fan-out, swapping the send loop for a
vendor call is a contained change; the subscriptions table and the worker stay.

## Platform constraints (why the UI looks the way it does)

- **iOS delivers Web Push only to Home Screen apps** (iOS 16.4 and later), never
  to a Safari tab. The Notifications card detects this and says so instead of
  showing a toggle that cannot work.
- **The permission prompt must follow a tap.** Browsers ignore or penalise a
  prompt fired on page load. The toggle is the tap.
- **A denied prompt is sticky on iOS.** The only way back is the system
  Settings app. The card shows a "blocked" state with that hint rather than a
  toggle that silently fails.
- **Subscriptions die silently** when the app is deleted or site data is
  cleared. The push service answers 404 or 410 on the next send; the server
  treats that as "forget this device".
- **Delivery is best effort.** Focus modes and Low Power Mode delay or drop.
  Every event here is also visible in the app, so a lost push costs nothing.
- **Payloads are end-to-end encrypted** by the Web Push protocol (`web-push`
  encrypts with the subscription's keys), so Apple's and Google's push
  services cannot read them. Names and titles may appear in a payload. The
  existing Sentry rule still applies: nothing sent to Sentry carries a body or
  a name.
- **Testing on iOS needs HTTPS and an installed app.** Preview deployments sit
  behind Vercel SSO, so the owner verifies real delivery by hand against
  production. Localhost is a secure context for Android Chrome and desktop.

## Notification copy

The group's name is always the title, because a member can belong to more
than one group. The actor never receives a notification for their own action.

| Event | Audience | Body | Tap opens |
|---|---|---|---|
| Meeting created | group minus actor | `Sameer added a meeting: Game night on Tue, Oct 14` (meetings always have a title) | `/meetings/{id}` |
| Meal set | group minus actor | `Sameer set the meal for Tue, Oct 14: Tacos` | `/meetings/{id}` |
| Recipe added | group minus actor | `Sameer added a recipe: Tacos` | `/recipes/{id}` |
| Join requested | admins of the group | `Priya asked to join` | `/group` |
| Request approved | the requester | `You're in. Welcome to Tuesday Group.` | `/` |

Dates use the existing `formatMeetingDate` with a short form
(`{ weekday: "short", month: "short", day: "numeric" }`), so the body stays on
one lock-screen line.

Setting a meal replaces whatever was there, so re-setting a meal sends again
with the new recipe. Editing or deleting a meeting or recipe sends nothing.

## Architecture

### Data model

One new table in `src/db/schema.ts`:

```
push_subscriptions
  id          text  pk, uuid default
  user_id     text  not null, references user(id) on delete cascade
  endpoint    text  not null, unique
  p256dh      text  not null
  auth        text  not null
  user_agent  text  null        -- for the owner's debugging only, never shown
  created_at  timestamp not null default now()
index on user_id
```

Subscriptions belong to a user, not a group. One toggle covers every group the
member is in. The `endpoint` unique constraint is what makes subscribe
idempotent: re-subscribing the same device upserts.

No preferences table. "On" for a device means its row exists.

### Environment

Added to the validated server env in `src/lib/env.ts`:

- `VAPID_PRIVATE_KEY` (optional)
- `VAPID_SUBJECT` (optional; a `mailto:` URL or https URL identifying the sender)

And for the browser:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (optional in the server env too, since the
  transport signs with it; the one client module that subscribes reads it from
  `process.env` directly, per the `NEXT_PUBLIC_` exception in the conventions)

When the private key or subject is unset, the transport logs one console line
per send and returns without sending, the same pattern as the email transport's
console mode. This keeps local dev, CI, and e2e working with no keys. The owner
generates the key pair once with `npx web-push generate-vapid-keys` and enters
it into Vercel and `.env`. Keys never enter the repository; `.env.example`
documents the three names.

### Service worker (`src/app/sw.ts`)

Two listeners added to the existing Serwist worker:

- `push`: parses the event's JSON payload `{ title, body, url }` and calls
  `registration.showNotification(title, { body, icon: "/icons/icon-192.png", data: { url } })`.
  A payload that fails to parse shows nothing (a push with no displayable
  payload is a bug, not something to surface to a member).
- `notificationclick`: closes the notification, then looks for an open window
  of this app. If one exists, focuses it and navigates it to `data.url`.
  Otherwise opens a new window at that URL.

### Transport (`src/lib/push.ts`)

Depends on `web-push`, the db client, env, and monitoring. Knows nothing about
meetings or groups.

```ts
export type PushPayload = { title: string; body: string; url: string };

export async function saveSubscription(userId, { endpoint, keys: { p256dh, auth }, userAgent? }): Promise<void>
  // upsert by endpoint; a device that changes hands (re-sign-in as another user) is reassigned

export async function deleteSubscription(userId, endpoint): Promise<void>
  // scoped to the owner, so one user cannot remove another's device

export async function sendToUsers(userIds: string[], payload: PushPayload): Promise<{ attempted: number; failed: number }>
  // loads every subscription for those users; sends all in parallel;
  // 404/410 deletes the row; any other failure is counted and logged
  // (subscription id and status code only); never throws
```

Configuration (`webpush.setVapidDetails`) happens lazily on first send so
importing the module has no side effects and the unconfigured path never
touches `web-push`.

### Domain (`src/lib/notifications.ts`)

One function per event. Each takes ids only and does its own lookups, so a
server action calls it in one line and a future cron handler can call it the
same way. Each resolves its recipients, builds its payload, and calls
`sendToUsers`. Each catches everything and reports to monitoring; none throws.

```ts
export async function notifyMeetingCreated({ actorId, meetingId })
export async function notifyMealSet({ actorId, meetingId })
export async function notifyRecipeAdded({ actorId, recipeId })
export async function notifyJoinRequested({ groupId, requesterId })
export async function notifyRequestApproved({ groupId, userId })
```

Recipient shapes, all read from the `member` table:

- whole group minus the actor (meeting, meal, recipe)
- admins of the group (join requested)
- one user (request approved)

The copy builders are pure functions exported from the same module and unit
tested without a database:

```ts
export function meetingCreatedCopy({ groupName, actorName, date, title, meetingId }): PushPayload
export function mealSetCopy({ groupName, actorName, date, recipeName, meetingId }): PushPayload
export function recipeAddedCopy({ groupName, actorName, recipeName, recipeId }): PushPayload
export function joinRequestedCopy({ groupName, requesterName }): PushPayload
export function requestApprovedCopy({ groupName }): PushPayload
```

### Call sites

Each server action schedules the notify call with `after()` once its domain
call has succeeded, so the member's save returns before any push leaves.
Nothing inside `after()` can fail the action.

| Action file | Action | Notify call |
|---|---|---|
| `meetings/actions.ts` | `createMeetingAction` | `notifyMeetingCreated` |
| `meals/actions.ts` | the set-meal action | `notifyMealSet` |
| `recipes/actions.ts` | `createRecipeAction` | `notifyRecipeAdded` |
| `join/actions.ts` | `requestToJoinAction` | `notifyJoinRequested`, only when a new request row was created |
| `group/actions.ts` | `approveRequestAction` | `notifyRequestApproved` |

Two domain functions change their return value to make this possible:

- `requestToJoin` returns `{ groupId, groupName, created: boolean }`. A repeat
  tap on an invite link while a request is already pending must not ping the
  admins again.
- `approveRequest` returns `{ groupId, userId }` so the action knows whom to
  tell.

### Subscribe and unsubscribe actions (`src/app/(app)/settings/actions.ts`)

- `subscribeAction(subscription)`: takes the browser's `PushSubscription.toJSON()`
  plus the user agent as a plain object, parses it with zod (endpoint as `https`
  URL, `keys.p256dh` and `keys.auth` as non-empty strings, user agent optional
  and capped) and calls `saveSubscription` for the signed-in user. Returns
  `{ error }` for the card to show inline.
- `unsubscribeAction(endpoint)`: calls `deleteSubscription` for the signed-in
  user.

Both call `requireUser()` first, like every other action.

### Settings page (`src/app/(app)/settings/page.tsx`)

Server component. Renders, in order:

1. Heading "Settings"
2. `DisplayNameCard` (moved from Group)
3. `AppearanceCard` (moved from Group)
4. `NotificationsCard` (new)
5. `ReportProblemDialog` and `SignOutButton` (moved from Group)

The Group page keeps its header, pending requests, invite link, member list,
and Leave group. Its header row gains a gear icon button (`Button` with
`variant="secondary" size="icon"`, `aria-label="Settings"`) rendered as a link
to `/settings`, sitting to the right of the group name. Where the admin's
Rename pill already sits in that row, the gear goes to its right. The tab
bar's active test for the Group tab also matches `/settings`.

The `updateDisplayNameAction` stays in `group/actions.ts`; only the card that
calls it moves.

### Notifications card (`src/components/notifications-card.tsx`)

A client component. On mount it decides one of four states from three facts:

| Fact | Source |
|---|---|
| `supported` | `"PushManager" in window && "serviceWorker" in navigator`, and on iOS also `matchMedia("(display-mode: standalone)").matches` |
| `permission` | `Notification.permission` (`default`, `granted`, `denied`) |
| `subscribed` | `registration.pushManager.getSubscription()` returns a subscription |

The toggle reflects the browser, per the brainstorming decision. When the card
mounts in the "on" state it also posts the existing subscription to
`subscribeAction` once. The upsert is idempotent, so this costs nothing when
the server already knows the device, and it reassigns the device when a
different member has since signed in on it. This is a sync of an existing
subscription, not a re-subscribe: it never triggers the permission prompt.

The state function is pure and unit tested:

```ts
export function cardState({ supported, permission, subscribed }): "unsupported" | "blocked" | "on" | "off"
```

Rendering:

- **unsupported**: "Notifications need the Home Screen app. In Safari, tap
  Share, then Add to Home Screen, and open Small Group from there." No toggle.
- **blocked**: toggle shown off and disabled. "Notifications are blocked for
  Small Group. Turn them on in your phone's Settings, under Notifications."
- **off**: toggle off. Tapping it: `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`,
  which triggers the system prompt; on success, posts the subscription to
  `subscribeAction`; the toggle shows "on" only once the server has saved it.
  If the prompt is denied the card moves to blocked. If the action errors, the
  browser subscription is dropped again and the error shows inline.
- **on**: toggle on. Tapping it: `subscription.unsubscribe()` then
  `unsubscribeAction(endpoint)`; toggle shows off.

Explainer line under the toggle in every state except unsupported: "A heads-up
when someone adds a meeting, sets a meal, or shares a recipe." Admins see the
same line; join requests are not worth a second sentence.

The toggle is a raw `<button role="switch" aria-checked>` styled like the
include-my-name switch in `prayer-compose.tsx`, with an `ALLOWED` entry in
`button-styling.test.ts` ("the notifications switch"), matching how the
appearance picker is handled. Until
the client has decided its state it renders the card frame with no toggle, the
same hydration approach as the appearance card.

### Monitoring

- Each notify function logs, at info level, the event name and the
  `{ attempted, failed }` counts. Never a body, a name, or an endpoint.
- A send that fails with anything other than 404 or 410 logs a warning with
  the subscription id and status code.
- A batch where every send failed, in an environment with keys configured and
  at least one subscription, is captured as an error with tag
  `area: "push"`, since that means the keys or the push service are broken and
  nobody will otherwise notice.
- Subscribe and unsubscribe actions call `logRefusal` on refusal, like every
  other action.

### Error handling summary

| Failure | Behaviour |
|---|---|
| No VAPID keys configured | Transport logs and returns. Nothing else changes. |
| Push service answers 404 or 410 | That subscription row is deleted. |
| Push service answers anything else non-2xx | Counted and logged; row kept. |
| `web-push` throws (network) | Counted and logged; row kept. |
| Payload JSON fails to parse in the worker | Nothing shown. |
| Member denies the permission prompt | Card shows blocked. |
| `subscribeAction` fails after the browser subscribed | Card unsubscribes the browser and shows the error. |
| Notify function throws for any reason | Caught inside it, captured to Sentry, action unaffected. |

## Testing

**Unit (Vitest, no database)**

- Copy builders: all five, with the date in short form.
- `cardState` for every combination of its three inputs.
- The zod schema for incoming subscriptions: accepts a real
  `PushSubscription.toJSON()` shape, rejects `http:` endpoints, missing keys,
  and an oversized user agent.
- `env.ts`: the two new optional variables parse and a blank line means unset.

**Integration (Vitest with Postgres)**

- `saveSubscription` upserts by endpoint, including reassigning a device to a
  different user.
- `deleteSubscription` is scoped to the owner.
- Recipient resolution for the three audience shapes: the actor is excluded,
  only admins get join requests, members of another group never appear.
- `sendToUsers` with `web-push` mocked: a 410 deletes the row, a 500 keeps it
  and reports `failed: 1`, success reports the counts, and the unconfigured
  path sends nothing.
- `requestToJoin` reports `created: false` on a repeat request.
- `approveRequest` returns the group and user ids.

**E2E (Playwright)**

- The gear on the Group page opens Settings, which shows the display name,
  appearance, notifications, and sign out controls.
- In headless Chromium, which exposes `PushManager`, the Notifications card
  renders the toggle in the off state. (Real subscription is not attempted:
  the browser would need a push service and Playwright has none.)
- Existing specs that reach the appearance picker or Report a problem through
  the Group page are updated to go through Settings.

**By hand, by the owner, on an iPhone against production**

- Turn notifications on from Settings; set a meal from a second account; the
  notification arrives and tapping it opens that meeting.
- Delete the Home Screen app, reinstall, open Settings: the toggle shows off.

## Rollout

1. Generate VAPID keys locally. Private key and subject into Vercel's
   production environment and the owner's `.env`; public key as
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in both. Keys never enter the repository.
2. The migration adds `push_subscriptions`. The Vercel build already runs
   `drizzle-kit migrate` before `next build`.
3. One pull request. The Settings refactor and the push feature meet in the
   Notifications card; shipping Settings alone would ship an empty move.

## Planned follow-on (not in this cut)

A daily reminder the day before a meeting: a cron route handler, scheduled by
Vercel Cron in the morning, finds meetings dated tomorrow, and for each one
sends members who hold no claim on that meeting's meal items a nudge to sign
up. It reuses `sendToUsers` and the copy-builder pattern unchanged. Vercel
Hobby's once-a-day cron granularity fits this exactly. Details, including the
copy and whether members who have turned notifications on but have no meal
items to claim should hear anything, are to be worked out then.

## Out of scope

- Per-event preferences, quiet hours, or digests.
- Email or SMS fallback for members without push.
- Notifications for item claims, prayer bowl state, meeting or recipe edits,
  denied requests, or member promotion and removal.
- Badging the app icon.
- Silent re-subscription after a reinstall.
- A Home screen nudge to turn notifications on.
