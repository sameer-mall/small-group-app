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
| Sign-in screen | The passkey button shows only on a device that set one up. Shown to everyone beside email and Google, it read as a third way to create an account (owner review of the first mockups). A device with a passkey opens to a "Welcome back" screen where the passkey is the main action and "Use email instead" leads to today's form. Every other device sees today's form unchanged, with the passkey offered from the email field's keyboard suggestions (conditional UI) for members whose passkey synced to a new phone. This follows Google's guidance that a standalone passkey button suits users known to have passkeys, while a mixed user base keeps the form and adds autofill. |
| Session length | Unchanged (Better Auth default, 7 days sliding). 90-day sessions were discussed and deferred. |
| Passkey domain | Defaults to the host of `authBaseURL`, overridable with `PASSKEY_RP_ID`, so a future move to a custom domain can keep existing passkeys working through WebAuthn related origins (`/.well-known/webauthn` on the old domain). |
| Android | Same code. Passkeys live in Google Password Manager. Passkeys do not sync between Apple and Google; a member switching platforms sets it up again after one code sign-in. |
| Scope | No app lock on launch, no Face ID to confirm actions, no passkey-only accounts. One PR. |

## What members see

### Sign-in screen

Mockups: the "Face ID sign-in screens" design canvas
(https://claude.ai/artifact/FY1HUAZMnNkyttZo2sdc5C), top row.

**Device without a passkey** (no `passkeyId` in device storage): today's
screen, unchanged to the eye. Email form, "or", Continue with Google. No
passkey button. The email input gets `autocomplete="username webauthn"` and the
page starts a conditional passkey request on mount, so a member whose passkey
synced to this device (a new iPhone restored from iCloud, or a re-added
home-screen app that lost its storage) still gets it from the keyboard.

**Device with a passkey** (`passkeyId` set): a "Welcome back" screen.

- "Small Group", "Welcome back.", and the method icon in a 72px tinted circle.
- A primary `Button` with icon and label per device:

  | Device | Button |
  |---|---|
  | iPhone | `ScanFace` icon, "Sign in with Face ID" |
  | Android | `Fingerprint` icon, "Sign in with fingerprint" |
  | Anything else | `KeyRound` icon, "Sign in with a passkey" |

- An outline `Button`, "Use email instead", which swaps to the form above
  (conditional request included) without clearing `passkeyId`.
- No automatic prompt on load. The member taps the button; a prompt that pops
  on its own is easy to dismiss by accident.

Icons are lucide (already a dependency); Apple's Face ID glyph is not licensed
for the web. If the browser has no `PublicKeyCredential`, the form shows even
when `passkeyId` is set.

A successful passkey sign-in goes to `next`, the same as a code sign-in.

### After an emailed-code or Google sign-in

A bottom sheet over the first `(app)` screen, once per device, matching the
app's existing sheets:

> **Sign in with Face ID next time?**
> Skip the email code. Your face unlocks Small Group on this phone.
> [Turn on Face ID] [Not now]
> You can change this any time in Settings.

(Wording per device as above.) Turn on runs the OS prompt, then the sheet
closes. Not now closes it. Either way the device is marked as offered and never asked
again. The sheet is not shown when this device already created a passkey, when
the browser cannot do platform passkeys
(`isUserVerifyingPlatformAuthenticatorAvailable()` is false), or when the What's
new popup is showing in the same load (the sheet waits for the next sign-in
rather than stacking).

The sheet only follows a sign-in that just happened in this browser: the sign-in
form leaves a one-time note in `sessionStorage`, and the `(app)` layout reads
and clears it. Members already signed in when this ships are told by What's new
and turn it on from Settings.

### Settings → Face ID

A new card on Settings, titled per device ("Face ID", "Fingerprint sign-in",
"Passkeys").

- **None set up:** one line of explanation and a **Turn on** button.
- **Some set up:** an "On" pill by the title, then a row per passkey: icon,
  device name over "Added Nov 15", and an outline destructive **Remove**
  button. The passkey this device created is named "This iPhone" (per device).
  A hint under the list: "Removing one stops it working right away. Sign in
  with an email code any time." If this device has none, a **Turn on for this
  phone** button under the list. The pill needs a darker sage than
  `--success` (which is under 4.5:1 on `--success-tint`); add a token for it.
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
- `(app)` layout: a client `PasskeyOffer` bottom sheet.
- Settings: a server component lists passkeys with `auth.api.listPasskeys`.
  Turn on is a client button (registration must run in the browser). Remove is
  a server action that parses `{ id }` with zod, calls
  `auth.api.deletePasskey`, and calls `logRefusal` first in its refusal
  mapping. Removing the passkey this device created also clears `passkeyId`.

## Errors

| Case | Member sees |
|---|---|
| Cancels the Face ID prompt on Welcome back (`NotAllowedError`) | Nothing. The screen stays, ready to try again or use email. |
| Cancels while turning it on | Sheet closes, or Settings stays as it was. No error. |
| Passkey removed on the server but still offered by the phone | Switches to the form with a notice above it: "Face ID was turned off for this phone. Sign in with an email code, then you can turn it back on in Settings." (per-device wording). Clears `passkeyId`, so the next visit shows the form. |
| Offline or no response | `UNREACHABLE_MESSAGE` |
| No passkey support | Sign-in shows the form; Settings says "Not available in this browser." |

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
  verification) drives: code sign-in shows no passkey button, offer sheet, Turn
  on, sign out, Welcome back screen, passkey sign-in, remove in Settings, sign
  out, passkey sign-in shows the removed notice and the form. Run on port 3300.
- **Manual before merge:** a real iPhone with the installed app (Welcome back screen, label, sheet
  shows once, Face ID sign-in, sync to a second Apple device) and an Android
  phone in Chrome (label, fingerprint sign-in).

## Out of scope

- App lock on launch and Face ID to confirm actions.
- Passkey-only accounts (no email).
- Longer sessions (deferred).
- Related-origins setup for a domain move (only kept possible by
  `PASSKEY_RP_ID`).
