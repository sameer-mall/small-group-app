# Asking to turn notifications on, once, at first launch

**Date:** 2026-10-08
**Status:** approved in conversation; a follow-up to `2026-10-07-push-notifications-design.md`, shipped in the same PR (#72) at the owner's request

## Goal

Most members should end up with notifications on without hunting for the gear.
The browser and the OS own the permission, so the app cannot default it on; on
iOS the request must follow a tap inside the installed app, and the member must
tap Allow on Apple's prompt. What the app can do is ask, once, in its own words,
at the moment a member first opens the installed app.

## What a member sees

On the first launch of the installed app, after the page has rendered, a
centred dialog like the What's new popup:

- Title: **Hear about meals and meetings**
- Body: "Get a heads-up on this phone when someone adds a meeting, sets a
  meal, or shares a recipe. You can change this anytime under Settings."
- Primary, full width: **Turn on notifications**
- Below it, outline: **Not now**

Tapping **Turn on notifications** runs the same subscribe flow as the Settings
toggle, which triggers the system prompt. Allow: the dialog closes and the
device is subscribed. Deny: the dialog closes; Settings shows the blocked state
from then on. **Not now**, the X, Escape, or a tap outside: the dialog closes
and never shows again on this device. Either way, one showing per device.

## When it shows

All of these, decided on the client after mount, as a pure function
`shouldPromptForNotifications(...)` with unit tests:

| Fact | Required value |
|---|---|
| `pushSupported()` (from `src/lib/notifications-state.ts`) | true |
| Installed | `matchMedia("(display-mode: standalone)").matches` is true, on every platform, not only iOS. Someone reading the app in a browser tab has not committed to it yet, and asking there spends Chrome's prompt budget on people who may never come back. |
| `Notification.permission` | `"default"`. Granted means the toggle already did its job; denied means the question has been answered. |
| Browser subscription | none. |
| Per-device memory | no `small-group:notification-prompt` key in `localStorage`. |
| What's new popup | not showing this launch. When the layout has unseen releases to show, the notification prompt waits for the next launch. Two dialogs in a row is too much, and What's new has the member's attention first. |

The per-device memory is `localStorage`, value `"done"` after Turn on or
`"dismissed"` after any other close. It is a convenience, not state the server
needs: if storage is unavailable or cleared, the member is asked again, which
is the same outcome as a reinstall. Every read and write is wrapped in
try/catch and the dialog renders nothing until the client has decided.

No server flag. The toggle's semantics are per device, and so are this
dialog's.

## Where it lives

- `src/components/notification-prompt-dialog.tsx` (client), mounted in
  `src/app/(app)/layout.tsx` next to `WhatsNewDialog`. The layout already
  computes `whatsNewPopup(user.whatsNewSeen)`; it passes
  `deferred={releases.length > 0}` so the dialog knows to wait.
- The subscribe flow moves out of `NotificationsCard` into a shared client
  module, `src/lib/notifications-client.ts`:
  `subscribeThisDevice(): Promise<"on" | "blocked" | { error: string }>`
  and `unsubscribeThisDevice(): Promise<void>`. Both the card and the dialog
  call these, so the two never drift. The module is `"use client"`-safe: no
  zod, no db, it calls the existing `subscribeAction` and `unsubscribeAction`.
- `shouldPromptForNotifications` joins `cardState` in
  `src/lib/notifications-state.ts`.

## Testing

- Unit: `shouldPromptForNotifications` over every input that can block it.
- E2E (`e2e/notification-prompt.spec.ts`): Playwright cannot set
  `display-mode`, and headless Chromium reports `Notification.permission` as
  `"denied"` whatever the context grants, so a shared helper
  (`fakeInstalledApp` in `e2e/helpers.ts`) uses `context.addInitScript` to make
  `window.matchMedia("(display-mode: standalone)")` report `matches: true` and
  the permission getter report `"default"`. A fresh member sees the dialog on
  their first page after sign-in, before they have a group; **Not now** closes
  it; a reload does not bring it back. A second test confirms a plain browser
  tab is never asked. A third confirms the dialog waits while the What's new
  popup is showing and appears on the launch after. Existing specs are
  unaffected because headless Chromium is not standalone.
- By hand on an iPhone: delete and reinstall the Home Screen app, open it,
  see the dialog, tap Turn on, tap Allow, confirm Settings shows the toggle on.

## Out of scope

- Re-asking after a dismissal, on a schedule or after N launches.
- Asking in a browser tab, or on iOS Safari (the card's "needs the Home Screen
  app" copy covers that on Settings).
- A server-side record of who was asked.
