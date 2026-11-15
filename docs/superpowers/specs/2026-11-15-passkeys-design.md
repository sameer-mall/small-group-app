# Sign in with Face ID (passkeys)

**Date:** 2026-11-15
**Status:** approved in brainstorming; implementation plan to follow
**Parent spec:** `2026-07-02-small-group-pwa-design.md`, which signs members in
with emailed 6-digit codes and Google

## Goal

A member can sign in with Face ID on an iPhone, or with their fingerprint or
face unlock on Android, instead of waiting for an emailed code. Underneath it is
a passkey (WebAuthn): the phone keeps a private key and unlocks it with its own
biometrics, and the server stores only the public key. Emailed codes stay as
the way in for anyone without a passkey and as account recovery.

## Decisions made in brainstorming

| Question | Decision |
|---|---|
| How members turn it on | Offered once per device right after an emailed-code or Google sign-in ("Sign in with Face ID next time?"), and always available from Settings. |
| Wording | Per device: "Face ID" on iPhone, "fingerprint" on Android, "a passkey" everywhere else (iPad, Mac, Windows, Linux). Chosen from the user agent; a wrong guess only mislabels the button, because the OS shows its own prompt. |
| Sign-in screen | Email form stays primary. The passkey button sits under it in the existing "or" group, above "Continue with Google", always shown when the browser supports passkeys. The email field also offers the passkey in the keyboard suggestion bar (conditional UI). |
| Session length | Unchanged (Better Auth default, 7 days sliding). 90-day sessions were discussed and deferred. |
| Passkey domain | Defaults to the host of `authBaseURL`, overridable with `PASSKEY_RP_ID`, so a future move to a custom domain can keep existing passkeys working through WebAuthn related origins (`/.well-known/webauthn` on the old domain). |
| Android | Same code. Passkeys live in Google Password Manager. Passkeys do not sync between Apple and Google; a member switching platforms sets it up again after one code sign-in. |
| Scope | No app lock on launch, no Face ID to confirm actions, no passkey-only accounts. One PR. |

## What members see

### Sign-in screen

In the "or" group under the email form, first in the group:

| Device | Button |
|---|---|
| iPhone | `ScanFace` icon, "Sign in with Face ID" |
| Android | `Fingerprint` icon, "Sign in with fingerprint" |
| Anything else | `KeyRound` icon, "Sign in with a passkey" |

Icons are lucide (already a dependency); Apple's Face ID glyph is not licensed
for the web. The button is an outline `Button` like Google's (no floating-text
buttons). It is hidden when the browser has no `PublicKeyCredential`.

The email input gets `autocomplete="username webauthn"` and the page starts a
conditional passkey request on mount, so a device with a passkey offers it from
the keyboard. Pressing the button aborts that request before starting its own.

A successful passkey sign-in goes to `next`, the same as a code sign-in.

### After an emailed-code or Google sign-in

A card on the first `(app)` screen, once per device:

> **Sign in with Face ID next time?**
> Skip the email code. Your face unlocks the app on this phone.
> [Turn on] [Not now]

(Wording per device as above.) Turn on runs the OS prompt, then the card closes.
Not now closes it. Either way the device is marked as offered and never asked
again. The card is not shown when this device already created a passkey, when
the browser cannot do platform passkeys
(`isUserVerifyingPlatformAuthenticatorAvailable()` is false), or when the What's
new popup is showing in the same load (the card waits for the next sign-in
rather than stacking).

The card only follows a sign-in that just happened in this browser: the sign-in
form leaves a one-time note in `sessionStorage`, and the `(app)` layout reads
and clears it. Members already signed in when this ships are told by What's new
and turn it on from Settings.

### Settings → Face ID

A new card on Settings, titled per device ("Face ID", "Fingerprint sign-in",
"Passkeys").

- **None set up:** one line of explanation and a **Turn on** button.
- **Some set up:** a row per passkey: device name and date added ("iPhone ·
  added Nov 15"), the one this device created marked "This iPhone", each with a
  **Remove** button. If this device has none, a **Turn on for this phone**
  button under the list.
- **Browser without passkey support:** "Not available in this browser."

Removing deletes the passkey on the server; it stops working at once. The phone
may still list the dead passkey in its password manager until the member
deletes it there.

### What's new

One entry at the top of `src/lib/whats-new.ts` with the next id:
"Sign in with Face ID or your fingerprint instead of an email code. Turn it on
in Settings."

## How it is built

### Server

- Add the Better Auth passkey plugin (`@better-auth/passkey`, built on
  SimpleWebAuthn) to `src/lib/auth.ts`, before `nextCookies()`:
  - `rpID`: `env.PASSKEY_RP_ID ?? new URL(authBaseURL).hostname`
  - `rpName`: "Small Group"
  - `origin`: `authBaseURL`
  - registration `authenticatorSelection`: `residentKey: "required"`,
    `userVerification: "required"`
- `src/lib/env.ts`: optional `PASSKEY_RP_ID` (a bare hostname).
- Previews use the branch alias as both origin and passkey domain. Passkeys made
  on a preview work only on that preview, and only from the branch alias URL.

Confirm the package name, option names, and endpoint names against the
installed Better Auth version when writing the plan.

### Database

A `passkey` table generated by the Better Auth CLI into `src/db/auth-schema.ts`
(id, name, publicKey, userId with cascade delete, credentialID, counter,
deviceType, backedUp, transports, createdAt, aaguid), with one Drizzle
migration. Nothing secret is stored.

### Client

- `src/lib/auth-client.ts`: add `passkeyClient()`.
- `src/lib/passkey-device.ts` (no zod, browser-safe):
  - `passkeyMethod(userAgent)` returns `{ kind: "face-id" | "fingerprint" |
    "passkey", label, deviceName }`. iPhone is face-id; Android is fingerprint;
    iPad, Mac, and everything else is passkey (they may be Touch ID).
    `deviceName` ("iPhone", "Android phone", "iPad", "Computer") names new
    passkeys; members cannot rename them.
  - `passkeySupported()` and `platformPasskeyAvailable()` wrap the browser
    checks.
  - Device storage in `localStorage`, every access in try/catch:
    `passkeyId` (the id this device created) and `passkeyOffered` (prompt
    shown). Plus the `sessionStorage` "just signed in" note.
- Sign-in form: the passkey button, conditional UI on the email field, and the
  "just signed in" note after code and Google sign-ins.
- `(app)` layout: a client `PasskeyOffer` card.
- Settings: a server component lists passkeys with `auth.api.listPasskeys`.
  Turn on is a client button (registration must run in the browser). Remove is
  a server action that parses `{ id }` with zod, calls
  `auth.api.deletePasskey`, and calls `logRefusal` first in its refusal
  mapping. Removing the passkey this device created also clears `passkeyId`.

## Errors

| Case | Member sees |
|---|---|
| Cancels the sign-in prompt, or this device has no passkey (iOS reports both as `NotAllowedError`) | "Face ID isn't set up on this phone yet. Sign in with an email code, then you can turn it on." (per-device wording) |
| Cancels while turning it on | Card closes, or Settings stays as it was. No error. |
| Passkey removed on the server but still offered by the phone | "That Face ID sign-in was removed. Sign in with an email code." Clears `passkeyId`. |
| Offline or no response | `UNREACHABLE_MESSAGE` |
| No passkey support | Button hidden on sign-in; Settings says "Not available in this browser." |

No em dashes in any of this copy.

Monitoring: a cancelled prompt is normal and is not reported. Unexpected client
errors report the error name only. Nothing sent to Sentry includes passkey
names, emails, or credential ids.

## Testing

- **Unit:** `passkeyMethod` over a table of user agents (iPhone, iPad, Android
  phone, Android tablet, Mac, Windows, Linux); device storage helpers including
  storage that throws.
- **Integration (Postgres):** listing returns only the member's own passkeys;
  remove deletes the member's own and refuses another member's; refusal copy is
  mapped.
- **E2E (Playwright, Chromium):** a CDP virtual authenticator
  (`WebAuthn.addVirtualAuthenticator`, internal transport, resident keys, user
  verification) drives: code sign-in, offer card, Turn on, sign out, passkey
  sign-in, remove in Settings, passkey sign-in shows the removed message. Run on
  port 3300.
- **Manual before merge:** a real iPhone with the installed app (label, card
  shows once, Face ID sign-in, sync to a second Apple device) and an Android
  phone in Chrome (label, fingerprint sign-in).

## Out of scope

- App lock on launch and Face ID to confirm actions.
- Passkey-only accounts (no email).
- Longer sessions (deferred).
- Related-origins setup for a domain move (only kept possible by
  `PASSKEY_RP_ID`).
