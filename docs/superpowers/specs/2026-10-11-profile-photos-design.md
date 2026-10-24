# Profile photos

**Date:** 2026-10-11
**Status:** approved in brainstorming; implemented by the plan of the same date
**Parent spec:** `2026-07-02-small-group-pwa-design.md`, which runs the UI on
display names and avatar initials

## Goal

A member can put a photo of themselves next to their name, so the group sees a
face on the member list, on meal claims, and on join requests. They can add one
on the Welcome screen when they first sign in, and add, change, or remove it any
time from Settings. Members who signed in with Google start with their Google
photo. Everyone else, and anyone who removes their photo, shows initials as
today.

## Decisions made in brainstorming

| Question | Decision |
|---|---|
| Storage | Vercel Blob (public store, Hobby plan). Cloudinary was considered and rejected: its transforms are not needed when every avatar is one fixed size, and it would be a second vendor with its own account and keys. |
| Google photos | Shown automatically. Better Auth already stores the Google profile picture URL in `user.image` at first sign-in. A member can replace or remove it like any other photo. |
| Cropping | A crop step: pinch and drag to frame the face inside a square, plus a zoom slider for desktop. Hand-rolled, no dependency, because the owner wants the mechanics. `react-easy-crop` is the bail-out if gesture handling turns into a bug hunt. |
| Upload path | The browser crops and encodes; a server action receives a small square JPEG, normalizes it, stores it, and writes the URL to `user.image`. Vercel's client-upload flow (token handshake plus completion webhook) was rejected as overkill for a 100 KB file and because the webhook cannot reach localhost. |
| Server-side normalization | `sharp`, not Blob's `putImage`. The brainstorm leaned toward `putImage`; the plan switched to `sharp` because it runs with no network and no token, which is what lets the full flow run locally today, in CI, and in the e2e suite. `sharp` is already installed (Next uses it for image optimization) and is zero cost per transformation. See "Why sharp" below. |
| Where photos show | Everywhere initials show today for someone other than the viewer: the member list, claimed meal slots, pending join requests. The viewer's own slots keep the "You" bubble. The Settings "You" card and the Welcome screen show the member their own photo. |
| Welcome | The photo is optional. The screen shows the Google photo when there is one, otherwise an empty avatar, with "Add a photo". The name stays required. |
| Removal | "Remove photo" clears `user.image` and deletes the stored file if it is ours. A Google URL is just forgotten. |
| Scope | One PR. No group photos, no photo on prayers (the bowl is anonymous by design), no moderation queue. |

## Why sharp

The browser already produces a square JPEG, so the server could store it as
is. It does not, for three reasons:

1. **The server never trusts the client about pixels.** A tampered client could
   upload anything with a `.jpg` name. `sharp` decodes it or refuses, and what
   comes out is always a 256 by 256 WebP with no metadata.
2. **The result is the same in every environment.** Local, CI, previews, and
   production all run the same transform, so the e2e suite exercises the real
   code path rather than a fake.
3. **It is already there.** Next depends on `sharp` for image optimization and
   lists it in `serverExternalPackages`, so it is loaded from `node_modules` at
   runtime on Vercel rather than bundled. The only change is moving it from
   `devDependencies` to `dependencies`.

`putImage` stays an option if the function's cold start ever becomes a problem.

## Environment and storage modes

Connecting a Blob store to the Vercel project (revised 2026-10-24, after
doing it) sets `BLOB_STORE_ID` and `BLOB_WEBHOOK_PUBLIC_KEY` on the project.
It does not set a read-write token any more: the SDK signs requests with the
short-lived OIDC token Vercel hands every function request, which requires
"Secure Backend Access with OIDC Federation" to be on in the project's
Security settings. `vercel env pull` writes a 12-hour `VERCEL_OIDC_TOKEN` to
`.env.local`, which makes local uploads go to the real store. All three are
optional in `src/lib/env.ts`:

```
BLOB_STORE_ID           set by Vercel when a store is connected
VERCEL_OIDC_TOKEN       local only, from `vercel env pull`; on Vercel it comes with the request
BLOB_READ_WRITE_TOKEN   the older, hand-set credential; still honoured
```

`src/lib/avatar-storage.ts` picks a backend from them:

| Credentials | `VERCEL_ENV` | Backend |
|---|---|---|
| read-write token, or a store id with an OIDC token available | any | **Vercel Blob.** `put` with `access: "public"`, `contentType: "image/webp"`, `addRandomSuffix: false` (the pathname already carries a UUID), `cacheControlMaxAge` of one year. `del` by URL. On Vercel a store id alone counts, since the OIDC token arrives with each request. |
| none | unset (local, CI) | **Inline.** `put` returns a `data:image/webp;base64,…` URL that is stored in `user.image` itself. `del` is a no-op. A 256px WebP is about 15 KB, which is nothing for a local database and keeps the local and CI flow free of any external service. |
| none | set (Vercel) | **Disabled.** Uploads are hidden in the UI; Google photos still show. This is the state production is in until a store is connected, and it must not break the deploy. |

The storage interface is three functions, so the domain code is the same for
all three:

```ts
type AvatarStorage = {
  put(pathname: string, bytes: Buffer, contentType: string): Promise<string>; // returns the URL
  del(url: string): Promise<void>;
  owns(url: string): boolean; // true for a URL this backend produced
};
```

`owns` decides whether removing or replacing a photo deletes anything: Blob
URLs end in `.blob.vercel-storage.com`; inline URLs start with `data:`; Google
URLs belong to nobody and are left alone.

## Architecture

### Data model

No schema change. Better Auth's `user.image` (nullable text, already in
`src/db/auth-schema.ts`) holds one of: a Google profile URL, a Blob URL, an
inline data URL, or null.

### Domain: `src/lib/avatars.ts`

```ts
export const AVATAR_SIZE = 256;             // stored pixels, square
export const MAX_UPLOAD_BYTES = 1_000_000;  // what the action accepts; the browser sends ~100 KB

// sharp: auto-rotate from EXIF, cover-resize to AVATAR_SIZE square, WebP, strip metadata.
// Throws Error("unreadable-image") when sharp cannot decode the input.
export async function processAvatar(input: Buffer): Promise<Buffer>;

// process -> storage.put(`avatars/${userId}/${uuid}.webp`) -> update user.image ->
// delete the previous image if storage.owns(it). Throws Error("not-found") if the
// user row is gone, Error("unavailable") when storage is disabled.
export async function saveAvatar(userId: string, input: Buffer): Promise<string>;

// user.image = null, then delete the previous image if storage.owns(it).
export async function removeAvatar(userId: string): Promise<void>;
```

Order of operations in `saveAvatar`: store the new file first, then update the
row, then delete the old file. A crash between steps leaves at worst an
orphaned blob, never a row pointing at a missing file. Deleting the old file is
awaited but a failure there is logged, not surfaced: the member's new photo is
already saved.

### Server actions: `src/app/(app)/settings/actions.ts`

```ts
updateAvatarAction(_prev: ActionState, formData: FormData): Promise<ActionState>
removeAvatarAction(_prev: ActionState, _formData: FormData): Promise<ActionState>
```

Both use a new `requireAccount()` guard in `src/lib/dal.ts`: signed in, name
not required. `requireUser()` redirects a nameless member to Welcome, and
Welcome is exactly where the first upload happens.

`updateAvatarAction` reads `formData.get("photo")`, checks it is a `File` at
most `MAX_UPLOAD_BYTES`, and hands the bytes to `saveAvatar`. Refusals map to
inline copy:

| Code | Copy |
|---|---|
| no file, too big, `unreadable-image` | That photo couldn't be read. Try a different one. |
| `unavailable` | Photos aren't available right now. |
| `not-found` | That didn't work. Try refreshing the page. |

Anything else rethrows. Both actions `revalidatePath("/(app)", "layout")`, the
same scope as a name change and for the same reason (`src/revalidation.test.ts`).

### Locking the Better Auth endpoint

Better Auth's `/update-user` endpoint accepts `image` from the browser, so today
any signed-in member could point their avatar at an arbitrary URL that every
other member's browser would then load. A `hooks.before` middleware in
`src/lib/auth.ts` rejects a `/update-user` body that contains `image` with a
400. Our own writes go through Drizzle and never touch that endpoint. Google
sign-in still sets the image on account creation (that path is
`createOAuthUser`, not `/update-user`), and a repeat Google sign-in does not
overwrite it (Better Auth only does that with `overrideUserInfo`, which is off).

### Browser: picking and cropping

`src/components/avatar.tsx` renders one avatar: an `<img>` when there is a URL,
initials otherwise, and it falls back to initials if the image fails to load.
`referrerPolicy="no-referrer"`, `alt=""` (the name is always adjacent),
`draggable={false}`. It is the only place avatar markup lives; the three rows
that render initials today switch to it.

`src/components/avatar-picker.tsx` is the member's own control, used on
Welcome and Settings: the current avatar, an "Add a photo" or "Change photo"
button, a "Remove photo" button when there is one, and a hidden
`<input type="file" accept="image/*">`. Choosing a file opens the crop dialog;
confirming the crop calls `updateAvatarAction` immediately. The picker shows a
pending state while the action runs and the error copy inline. A file over
20 MB is refused in the browser before it is read.

`src/components/crop-dialog.tsx` is the crop step, in the app's `Dialog`:

- A square viewport (the dialog's width minus padding, at most 320px) with the
  image inside it, positioned by `translate` and `scale`. `touch-action: none`
  on the viewport so the browser does not scroll or zoom the page.
- One pointer drags. Two pointers pinch: the zoom factor is the ratio of the
  distance between them now to the distance at the previous event, applied
  around their midpoint so the point under the fingers stays put. A range
  input zooms for desktop and keyboard users. Wheel zooms too.
- The image always covers the viewport: zoom is clamped to [1, 4] and the
  offset to the range that keeps every viewport pixel on the image.
- Confirm draws the viewport's region of the source image onto a 512px canvas
  and encodes JPEG at quality 0.9. 512 rather than 256 so the server's final
  downscale averages out JPEG artifacts. Cancel discards everything.
- Decoding failures (an unsupported format on this browser) show "That photo
  couldn't be read. Try a JPEG or PNG." and close.

The geometry is pure functions in `src/lib/crop.ts`, unit tested:

```ts
coverScale(imageW, imageH, viewport): number                  // scale at zoom 1
clampOffset(offset, imageW, imageH, viewport, zoom): Offset   // keeps the viewport covered
zoomAround(state, factor, point, imageW, imageH, viewport): CropState  // pinch/wheel
sourceRect(state, imageW, imageH, viewport): { x, y, size }   // what to draw
```

Browsers apply EXIF orientation when decoding an `<img>`, and `drawImage` uses
the oriented bitmap, so the crop the member sees is the crop that is sent.
`sharp` then applies `rotate()` as well; on an already-upright JPEG from a
canvas that is a no-op.

### Screens

**Welcome** (`src/app/(auth)/welcome/page.tsx`): revised 2026-10-12 to
match the Settings card. The photo block runs edge to edge across the top of
the screen (300px; the avatar colour with a person mark until a photo is
chosen), and the cream page rises into it with the same arc, holding the
heading, the photo buttons centered, the copy "So the group knows your face.
Optional.", and then the name form. The buttons' panel clips its own arc
circle; left unclipped it widens the page and a phone zooms out to fit it.

**Settings** (`src/app/(app)/settings/page.tsx`): `DisplayNameCard` becomes
`ProfileCard` (`src/components/profile-card.tsx`). Revised 2026-10-12 after a
design pass: the "You" card opens with the photo edge to edge (300px tall, or
a 176px block of the initials when there is none), and a white panel rises
into it with a shallow circular arc, holding the name, email, "Edit name",
and the two photo buttons side by side. The arc is a 948px circle positioned
32px up from the photo's bottom edge, so it is one gentle curve across the
card that still slopes where it meets the sides.

**Group**, **Meeting**: `MemberRow`, `PendingRequestRow`, and `MealSlotRow`
render `<Avatar>` for other members. `listMembers`, `listPendingRequests`, and
`getMealPlan` select `user.image` alongside `user.name`. The meal row's
optimistic claim state carries `image` too, so a claim by someone else that
arrives on a focus refresh paints with their photo.

### What's new

Entry 6 at the top of `src/lib/whats-new.ts`:

> **Put a face to your name.** Add a photo of yourself from Settings and the
> group sees it next to your name on the member list and meal sign-ups. Signed
> in with Google? Your Google photo shows until you pick another.

## Privacy and monitoring

- The browser re-encodes through a canvas and the server re-encodes through
  `sharp`, so no EXIF (location, device, timestamp) survives.
- Blob store is public by URL, which is what lets members' browsers load each
  other's photos with a plain `<img>`. URLs carry a UUID and the user id, not a
  name.
- Nothing new goes to Sentry beyond refusal codes via `logRefusal`. An
  avatar URL is an id, not content, and is fine in a log.
- A failed deletion of an old blob is reported with `Sentry.captureException`
  tagged `area: "avatar"`, since it leaks storage silently otherwise.

## Testing

- **Unit:** `src/lib/crop.test.ts` (geometry, including the clamp and the
  pinch-around-a-point invariant), `src/lib/avatars.test.ts` (`processAvatar`
  with images `sharp` generates: a landscape PNG comes out 256 square WebP, an
  EXIF-rotated JPEG comes out upright, metadata is gone, garbage throws
  `unreadable-image`), `src/lib/avatar-storage.test.ts` (backend selection and
  the inline backend).
- **Integration:** `tests/integration/avatars.test.ts` drives `saveAvatar` and
  `removeAvatar` against the database with the inline backend: the row changes,
  the previous image is handed to `del`, a Google URL is not. A test against
  `auth.api.updateUser` confirms `image` is rejected and `name` still works.
- **e2e:** `e2e/profile-photo.spec.ts`: a new member adds a photo on Welcome
  (a PNG generated in the test and attached with `setInputFiles`), confirms
  the crop, lands with the photo on Settings; a second member sees it on the
  member list and on a meal slot; the first member removes it and both see
  initials again.
- Existing guards keep applying: `button-styling.test.ts` (every tappable
  element is a `Button`; the hidden file input is not tappable) and
  `revalidation.test.ts`.

## Rollout

1. Merge. Production deploys with uploads hidden (no token yet) and Google
   photos showing.
2. In the Vercel dashboard, Storage, create a Blob store with public access and
   connect it to the project for all environments. Vercel adds
   `BLOB_READ_WRITE_TOKEN`. Redeploy.
3. Upload a photo on production and check it from a second account.

## Out of scope

Group photos, photos on prayers, admin moderation of photos, serving avatars
through `next/image`, caching avatars in the service worker, and migrating
existing Google URLs into Blob.
