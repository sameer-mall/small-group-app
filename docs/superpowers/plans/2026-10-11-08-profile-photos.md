# Profile Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members add, change, and remove a photo of themselves (Welcome and Settings), and the group sees it in place of initials on the member list, meal claims, and join requests.

**Architecture:** The browser crops to a square and encodes a 512px JPEG; a server action normalizes it with `sharp` to a 256px WebP, stores it through a three-function storage interface (Vercel Blob in production, an inline data URL locally and in CI, disabled on Vercel without a token), and writes the URL to Better Auth's existing `user.image` column. One `Avatar` component renders image-or-initials everywhere.

**Tech Stack:** Next 16 server actions, Drizzle, Better Auth hooks, `sharp`, `@vercel/blob`, zod v4 (`z.file()`), Base UI Dialog, Pointer Events + canvas, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-11-profile-photos-design.md`

## Global Constraints

- All DB access through `src/db/client.ts`; no schema change (`user.image` exists).
- Server actions parse FormData with zod and return `issues[0].message` as inline copy. Zod stays out of `"use client"` files.
- Server env via `src/lib/env.ts` (`env`), never `process.env`.
- `logRefusal(err)` first in every action's refusal mapping; nothing with user content goes to Sentry.
- Every tappable element is `<Button>`/`buttonVariants` (`button-styling.test.ts`).
- Revalidate `"/(app)", "layout"`, never the root layout (`revalidation.test.ts`).
- No em dashes in UI copy or What's new. New What's new entry at the top with id 6.
- Stored avatar: 256 by 256 WebP, no metadata. Browser export: 512px JPEG quality 0.9. Zoom range [1, 4].
- Tests, e2e, and `pnpm add` need the Bash sandbox off (localhost Postgres and the npm registry are blocked). Use `./node_modules/.bin/<tool>` or `mise exec --`, not the PATH `pnpm` (Homebrew pnpm 11).

---

### Task 1: Dependencies and environment

**Files:**
- Modify: `package.json` (add `@vercel/blob`; move `sharp` to `dependencies`)
- Modify: `src/lib/env.ts`, `src/lib/env.test.ts`, `.env.example`

**Interfaces:**
- Produces: `env.BLOB_READ_WRITE_TOKEN: string | undefined`

- [ ] **Step 1: Install**

```bash
mise exec -- pnpm add @vercel/blob sharp@^0.35.3
```
(unsandboxed). Confirm `sharp` left `devDependencies` and `@vercel/blob` is in `dependencies`.

- [ ] **Step 2: Failing env test** in `src/lib/env.test.ts`:

```ts
  it("accepts the optional Blob token", () => {
    expect(parseEnv({ ...required, BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_x" }).BLOB_READ_WRITE_TOKEN).toBe(
      "vercel_blob_rw_x",
    );
    expect(parseEnv(required).BLOB_READ_WRITE_TOKEN).toBeUndefined();
  });
```

- [ ] **Step 3: Run** `./node_modules/.bin/vitest run src/lib/env.test.ts` (unsandboxed). Expected: FAIL (the key is dropped).

- [ ] **Step 4: Add to the schema** in `src/lib/env.ts`, after the VAPID block:

```ts
  // Profile photos (src/lib/avatar-storage.ts). Vercel injects it once a Blob
  // store is connected to the project. Unset locally, photos are stored
  // inline; unset on Vercel, uploads are hidden.
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
```

And in `.env.example`, at the end:

```
# Profile photos (Vercel Blob). Leave unset locally: photos are stored inline in the user row.
# Set in Vercel automatically when a Blob store is connected to the project.
# BLOB_READ_WRITE_TOKEN=
```

- [ ] **Step 5: Run** the env test. Expected: PASS. Commit: `Add the Blob token to the environment and sharp to runtime deps`.

---

### Task 2: Crop geometry

**Files:**
- Create: `src/lib/crop.ts`, `src/lib/crop.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type Offset = { x: number; y: number };
  type CropState = { zoom: number; offset: Offset };
  MIN_ZOOM = 1; MAX_ZOOM = 4;
  coverScale(imageW, imageH, viewport): number
  clampZoom(zoom): number
  clampOffset(offset, imageW, imageH, viewport, zoom): Offset
  zoomAround(state, factor, point, imageW, imageH, viewport): CropState
  sourceRect(state, imageW, imageH, viewport): { x: number; y: number; size: number }
  ```
  Conventions: `offset` is where the image's centre sits relative to the viewport's centre, in viewport pixels. `point` is in the same frame.

- [ ] **Step 1: Failing tests** `src/lib/crop.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { clampOffset, clampZoom, coverScale, MAX_ZOOM, sourceRect, zoomAround } from "./crop";

// A 400 by 200 image in a 100px viewport: at zoom 1 it renders 200 by 100,
// so it can slide 50px either way horizontally and not at all vertically.
const W = 400, H = 200, V = 100;

describe("coverScale", () => {
  it("makes the shorter side fill the viewport", () => {
    expect(coverScale(W, H, V)).toBe(0.5);
    expect(coverScale(200, 400, V)).toBe(0.5);
    expect(coverScale(100, 100, V)).toBe(1);
  });
});

describe("clampZoom", () => {
  it("keeps zoom between 1 and MAX_ZOOM", () => {
    expect(clampZoom(0.2)).toBe(1);
    expect(clampZoom(2.5)).toBe(2.5);
    expect(clampZoom(9)).toBe(MAX_ZOOM);
  });
});

describe("clampOffset", () => {
  it("keeps every viewport pixel on the image", () => {
    expect(clampOffset({ x: 80, y: 10 }, W, H, V, 1)).toEqual({ x: 50, y: 0 });
    expect(clampOffset({ x: -80, y: -10 }, W, H, V, 1)).toEqual({ x: -50, y: -0 });
  });

  it("allows more travel when zoomed in", () => {
    // Zoom 2: 400 by 200 rendered, 150 and 50 of slack each way.
    expect(clampOffset({ x: 999, y: 999 }, W, H, V, 2)).toEqual({ x: 150, y: 50 });
  });
});

// The image pixel under a viewport point, for the invariant below.
function imagePointAt(point: { x: number; y: number }, state: { zoom: number; offset: { x: number; y: number } }) {
  const s = coverScale(W, H, V) * state.zoom;
  return { x: W / 2 + (point.x - state.offset.x) / s, y: H / 2 + (point.y - state.offset.y) / s };
}

describe("zoomAround", () => {
  const centred = { zoom: 1, offset: { x: 0, y: 0 } };

  it("zooming at the centre leaves the centre in place", () => {
    expect(zoomAround(centred, 2, { x: 0, y: 0 }, W, H, V)).toEqual({ zoom: 2, offset: { x: 0, y: 0 } });
  });

  it("keeps the image point under the fingers fixed", () => {
    const point = { x: 20, y: -10 };
    const before = imagePointAt(point, centred);
    const after = zoomAround(centred, 1.5, point, W, H, V);
    expect(after.zoom).toBe(1.5);
    const afterPoint = imagePointAt(point, after);
    expect(afterPoint.x).toBeCloseTo(before.x);
    expect(afterPoint.y).toBeCloseTo(before.y);
  });

  it("clamps the zoom and then the offset", () => {
    const out = zoomAround({ zoom: 3.5, offset: { x: 0, y: 0 } }, 2, { x: 40, y: 40 }, W, H, V);
    expect(out.zoom).toBe(MAX_ZOOM);
    // Zoom 4: 800 by 400 rendered, 350 and 150 of slack.
    expect(Math.abs(out.offset.x)).toBeLessThanOrEqual(350);
    expect(Math.abs(out.offset.y)).toBeLessThanOrEqual(150);
  });

  it("zooming out past 1 stays at 1 and recentres as needed", () => {
    const out = zoomAround({ zoom: 1.2, offset: { x: 60, y: 10 } }, 0.5, { x: 0, y: 0 }, W, H, V);
    expect(out).toEqual({ zoom: 1, offset: { x: 50, y: 0 } });
  });
});

describe("sourceRect", () => {
  it("is the centre square at zoom 1 with no offset", () => {
    expect(sourceRect({ zoom: 1, offset: { x: 0, y: 0 } }, W, H, V)).toEqual({ x: 100, y: 0, size: 200 });
  });

  it("moves the other way from the offset: image dragged right shows its left side", () => {
    expect(sourceRect({ zoom: 1, offset: { x: 50, y: 0 } }, W, H, V)).toEqual({ x: 0, y: 0, size: 200 });
  });

  it("shrinks with zoom", () => {
    expect(sourceRect({ zoom: 2, offset: { x: 0, y: 0 } }, W, H, V)).toEqual({ x: 150, y: 50, size: 100 });
  });
});
```

- [ ] **Step 2: Run** `./node_modules/.bin/vitest run src/lib/crop.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `src/lib/crop.ts`:

```ts
// Geometry for the crop dialog (src/components/crop-dialog.tsx). Pure, so the
// clamp and pinch rules are testable without a browser.
//
// Frame of reference: the viewport is a square of `viewport` px. `offset` is
// where the image's centre sits relative to the viewport's centre, in viewport
// px (positive x: image shifted right, so the viewport shows more of its left
// side). `zoom` is relative to the cover fit: at zoom 1 the image's shorter
// side exactly fills the viewport.

export type Offset = { x: number; y: number };
export type CropState = { zoom: number; offset: Offset };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Rendered px per image px at zoom 1.
export function coverScale(imageW: number, imageH: number, viewport: number): number {
  return viewport / Math.min(imageW, imageH);
}

export function clampZoom(zoom: number): number {
  return clamp(zoom, MIN_ZOOM, MAX_ZOOM);
}

// The image must cover the viewport: the centre can stray at most half the
// difference between the rendered size and the viewport, each way.
export function clampOffset(
  offset: Offset,
  imageW: number,
  imageH: number,
  viewport: number,
  zoom: number,
): Offset {
  const s = coverScale(imageW, imageH, viewport) * zoom;
  const maxX = (imageW * s - viewport) / 2;
  const maxY = (imageH * s - viewport) / 2;
  return { x: clamp(offset.x, -maxX, maxX), y: clamp(offset.y, -maxY, maxY) };
}

// Multiply the zoom by `factor` so that the image point under `point` stays
// under `point`: a pinch zooms around the fingers, a wheel around the cursor.
// With p the image point, point = offset + p * s before and
// point = offset' + p * s * k after, so offset' = point - (point - offset) * k.
export function zoomAround(
  state: CropState,
  factor: number,
  point: Offset,
  imageW: number,
  imageH: number,
  viewport: number,
): CropState {
  const zoom = clampZoom(state.zoom * factor);
  const k = zoom / state.zoom;
  const offset = {
    x: point.x - (point.x - state.offset.x) * k,
    y: point.y - (point.y - state.offset.y) * k,
  };
  return { zoom, offset: clampOffset(offset, imageW, imageH, viewport, zoom) };
}

// The square of the source image, in image px, that the viewport shows. This
// is what drawImage copies out.
export function sourceRect(
  state: CropState,
  imageW: number,
  imageH: number,
  viewport: number,
): { x: number; y: number; size: number } {
  const s = coverScale(imageW, imageH, viewport) * state.zoom;
  const size = viewport / s;
  const centreX = imageW / 2 - state.offset.x / s;
  const centreY = imageH / 2 - state.offset.y / s;
  return { x: centreX - size / 2, y: centreY - size / 2, size };
}
```

- [ ] **Step 4: Run** the test. Expected: PASS. Commit: `Crop geometry for the photo cropper`.

---

### Task 3: Avatar storage backends

**Files:**
- Create: `src/lib/avatar-storage.ts`, `src/lib/avatar-storage.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type AvatarStorage = {
    put(pathname: string, bytes: Buffer, contentType: string): Promise<string>;
    del(url: string): Promise<void>;
    owns(url: string): boolean;
  };
  blobStorage: AvatarStorage; inlineStorage: AvatarStorage;
  selectStorage(e: { BLOB_READ_WRITE_TOKEN?: string; VERCEL_ENV?: string }): AvatarStorage | null
  avatarStorage: AvatarStorage | null   // selectStorage(env)
  avatarsEnabled: boolean               // avatarStorage !== null
  ```

- [ ] **Step 1: Failing tests** `src/lib/avatar-storage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { blobStorage, inlineStorage, selectStorage } from "./avatar-storage";

describe("selectStorage", () => {
  it("uses Vercel Blob whenever the token is set", () => {
    expect(selectStorage({ BLOB_READ_WRITE_TOKEN: "t" })).toBe(blobStorage);
    expect(selectStorage({ BLOB_READ_WRITE_TOKEN: "t", VERCEL_ENV: "production" })).toBe(blobStorage);
  });

  it("stores inline off Vercel without a token (local, CI)", () => {
    expect(selectStorage({})).toBe(inlineStorage);
  });

  it("disables photos on Vercel without a token, rather than filling the database", () => {
    expect(selectStorage({ VERCEL_ENV: "preview" })).toBeNull();
    expect(selectStorage({ VERCEL_ENV: "production" })).toBeNull();
  });
});

describe("inlineStorage", () => {
  it("returns a data URL that carries the bytes", async () => {
    const url = await inlineStorage.put("avatars/u/x.webp", Buffer.from("hello"), "image/webp");
    expect(url).toBe(`data:image/webp;base64,${Buffer.from("hello").toString("base64")}`);
    expect(inlineStorage.owns(url)).toBe(true);
    expect(inlineStorage.owns("https://lh3.googleusercontent.com/a/x")).toBe(false);
  });

  it("has nothing to delete", async () => {
    await expect(inlineStorage.del("data:image/webp;base64,aGVsbG8=")).resolves.toBeUndefined();
  });
});

describe("blobStorage.owns", () => {
  it("recognises only the store's own URLs", () => {
    expect(blobStorage.owns("https://abc123.public.blob.vercel-storage.com/avatars/u/x.webp")).toBe(true);
    expect(blobStorage.owns("https://lh3.googleusercontent.com/a/x")).toBe(false);
    expect(blobStorage.owns("data:image/webp;base64,aGVsbG8=")).toBe(false);
    expect(blobStorage.owns("not a url")).toBe(false);
  });
});
```

- [ ] **Step 2: Run** it. Expected: FAIL.

- [ ] **Step 3: Implement** `src/lib/avatar-storage.ts`:

```ts
import { del as blobDel, put as blobPut } from "@vercel/blob";
import { env, type Env } from "@/lib/env";

// Where processed avatars live. src/lib/avatars.ts decides what goes in; this
// decides where. Three backends, one interface, chosen once from the env.

export type AvatarStorage = {
  // Returns the URL that goes in user.image.
  put(pathname: string, bytes: Buffer, contentType: string): Promise<string>;
  del(url: string): Promise<void>;
  // True for a URL this backend produced, so a Google profile URL is never
  // handed to del().
  owns(url: string): boolean;
};

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// Production: a public Vercel Blob store. The SDK reads BLOB_READ_WRITE_TOKEN
// from the process environment itself. Pathnames already carry a UUID, so no
// random suffix; the URL changes on every upload, which is what makes a
// year-long cache header safe.
export const blobStorage: AvatarStorage = {
  async put(pathname, bytes, contentType) {
    const blob = await blobPut(pathname, bytes, {
      access: "public",
      contentType,
      addRandomSuffix: false,
      cacheControlMaxAge: ONE_YEAR_SECONDS,
    });
    return blob.url;
  },
  async del(url) {
    await blobDel(url);
  },
  owns(url) {
    try {
      return new URL(url).hostname.endsWith(".blob.vercel-storage.com");
    } catch {
      return false;
    }
  },
};

// Local dev and CI: the bytes ride along in user.image as a data URL. A 256px
// WebP is about 15 KB, nothing for a local database, and the whole flow runs
// with no account and no network.
export const inlineStorage: AvatarStorage = {
  async put(_pathname, bytes, contentType) {
    return `data:${contentType};base64,${bytes.toString("base64")}`;
  },
  async del() {},
  owns(url) {
    return url.startsWith("data:");
  },
};

// null means photos are off: on Vercel without a token, uploads are hidden
// rather than silently stored inline in the production database.
export function selectStorage(
  e: Pick<Env, "BLOB_READ_WRITE_TOKEN" | "VERCEL_ENV">,
): AvatarStorage | null {
  if (e.BLOB_READ_WRITE_TOKEN) return blobStorage;
  if (e.VERCEL_ENV) return null;
  return inlineStorage;
}

export const avatarStorage = selectStorage(env);
export const avatarsEnabled = avatarStorage !== null;
```

- [ ] **Step 4: Run** the test. Expected: PASS. Commit: `Avatar storage: Vercel Blob, inline, or off`.

---

### Task 4: Avatar domain

**Files:**
- Create: `src/lib/avatars.ts`, `src/lib/avatars.test.ts`, `tests/integration/avatars.test.ts`
- Modify: `src/lib/monitoring.ts` (add `reportAvatarCleanupFailure`)

**Interfaces:**
- Consumes: `AvatarStorage`, `avatarStorage` (Task 3)
- Produces:
  ```ts
  AVATAR_SIZE = 256; MAX_UPLOAD_BYTES = 1_000_000;
  UNREADABLE_PHOTO = "That photo couldn't be read. Try a different one.";
  avatarForm: z.object({ photo: z.file() })   // parsed from FormData
  processAvatar(input: Buffer): Promise<Buffer>              // throws Error("unreadable-image")
  saveAvatar(userId, input: Buffer, storage = avatarStorage): Promise<string>  // "unavailable" | "not-found"
  removeAvatar(userId, storage = avatarStorage): Promise<void>                 // "not-found"
  ```

- [ ] **Step 1: Failing unit tests** `src/lib/avatars.test.ts`:

```ts
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { AVATAR_SIZE, avatarForm, processAvatar } from "./avatars";

const RED = { r: 220, g: 40, b: 40 };
const BLUE = { r: 40, g: 60, b: 220 };

// 300 wide, 200 tall: red left half, blue right half.
async function redBlueJpeg(orientation?: number) {
  const left = await sharp({ create: { width: 150, height: 200, channels: 3, background: RED } }).png().toBuffer();
  const image = sharp({ create: { width: 300, height: 200, channels: 3, background: BLUE } }).composite([
    { input: left, left: 0, top: 0 },
  ]);
  return (orientation ? image.withMetadata({ orientation }) : image).jpeg().toBuffer();
}

async function pixel(webp: Buffer, x: number, y: number) {
  const { data } = await sharp(webp).raw().toBuffer({ resolveWithObject: true });
  const i = (y * AVATAR_SIZE + x) * 3;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

const near = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) =>
  Math.abs(a.r - b.r) < 20 && Math.abs(a.g - b.g) < 20 && Math.abs(a.b - b.b) < 20;

describe("processAvatar", () => {
  it("produces a square WebP of AVATAR_SIZE with no metadata", async () => {
    const out = await processAvatar(await redBlueJpeg());
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("webp");
    expect([meta.width, meta.height]).toEqual([AVATAR_SIZE, AVATAR_SIZE]);
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it("crops to the centre, keeping both halves", async () => {
    const out = await processAvatar(await redBlueJpeg());
    expect(near(await pixel(out, 10, 128), RED)).toBe(true);
    expect(near(await pixel(out, 245, 128), BLUE)).toBe(true);
  });

  it("applies the EXIF orientation before cropping", async () => {
    // Orientation 6 means "rotate 90 degrees clockwise to display": the left
    // (red) half becomes the top.
    const out = await processAvatar(await redBlueJpeg(6));
    expect(near(await pixel(out, 128, 10), RED)).toBe(true);
    expect(near(await pixel(out, 128, 245), BLUE)).toBe(true);
  });

  it("refuses bytes that are not an image", async () => {
    await expect(processAvatar(Buffer.from("not an image at all"))).rejects.toThrow("unreadable-image");
  });
});

describe("avatarForm", () => {
  it("accepts a small file and refuses an empty or missing one", () => {
    const ok = new File([new Uint8Array(10)], "avatar.jpg", { type: "image/jpeg" });
    expect(avatarForm.safeParse({ photo: ok }).success).toBe(true);
    const empty = new File([], "avatar.jpg", { type: "image/jpeg" });
    expect(avatarForm.safeParse({ photo: empty }).success).toBe(false);
    expect(avatarForm.safeParse({ photo: "avatar.jpg" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `./node_modules/.bin/vitest run src/lib/avatars.test.ts`. Expected: FAIL.

- [ ] **Step 3: Add to `src/lib/monitoring.ts`**, after `reportPushFailure`:

```ts
// An old avatar file that could not be deleted after a replace or remove.
// The member's change already landed; this is about storage leaking quietly.
export function reportAvatarCleanupFailure(err: unknown) {
  Sentry.captureException(err, { tags: { area: "avatar" } });
  flushAfterResponse();
}
```

- [ ] **Step 4: Implement** `src/lib/avatars.ts`:

```ts
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import { avatarStorage, type AvatarStorage } from "@/lib/avatar-storage";
import { reportAvatarCleanupFailure } from "@/lib/monitoring";

// A member's profile photo, stored in Better Auth's user.image. Google sign-in
// puts a Google profile URL there; this module puts ours (src/lib/avatar-
// storage.ts decides where). Members see it through <Avatar>, which falls
// back to initials.

// Stored pixels, square. Avatars render at 32 to 64 CSS px, so this covers a
// 3x display with room to spare.
export const AVATAR_SIZE = 256;
// What the action accepts. The browser sends a 512px JPEG, around 100 KB;
// this is a sanity bound, under Next's 1 MB server action body limit.
export const MAX_UPLOAD_BYTES = 1_000_000;
const CONTENT_TYPE = "image/webp";

export const UNREADABLE_PHOTO = "That photo couldn't be read. Try a different one.";

// The picker posts the cropped blob as `photo`. Parsed on the server like
// every other action's input (CLAUDE.md on zod); the message is what the
// member sees.
export const avatarForm = z.object({
  photo: z
    .file({ error: UNREADABLE_PHOTO })
    .min(1, UNREADABLE_PHOTO)
    .max(MAX_UPLOAD_BYTES, UNREADABLE_PHOTO),
});

// Whatever came in, out comes an upright AVATAR_SIZE square WebP with no
// metadata (sharp drops EXIF unless asked to keep it). rotate() with no
// argument applies the EXIF orientation, which is a no-op for the upright
// canvas output the picker sends. Throws Error("unreadable-image") when sharp
// cannot decode the bytes.
export async function processAvatar(input: Buffer): Promise<Buffer> {
  try {
    return await sharp(input, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new Error("unreadable-image");
  }
}

async function currentImage(userId: string): Promise<string | null> {
  const [row] = await db.select({ image: user.image }).from(user).where(eq(user.id, userId));
  if (!row) throw new Error("not-found");
  return row.image;
}

// Deletes a stored file we own; leaves Google URLs alone. A failure here is
// reported, not thrown: the member's change has already been saved.
async function forget(url: string | null, storage: AvatarStorage) {
  if (!url || !storage.owns(url)) return;
  try {
    await storage.del(url);
  } catch (err) {
    reportAvatarCleanupFailure(err);
  }
}

// Store first, then point the row at it, then drop the old file: a crash
// between steps leaves at worst an orphaned file, never a row pointing at
// nothing. Returns the new URL. Throws Error("unavailable") when photos are
// off (Vercel without a token), "unreadable-image", or "not-found".
export async function saveAvatar(
  userId: string,
  input: Buffer,
  storage: AvatarStorage | null = avatarStorage,
): Promise<string> {
  if (!storage) throw new Error("unavailable");
  const previous = await currentImage(userId);
  const bytes = await processAvatar(input);
  const url = await storage.put(`avatars/${userId}/${crypto.randomUUID()}.webp`, bytes, CONTENT_TYPE);
  const updated = await db
    .update(user)
    .set({ image: url })
    .where(eq(user.id, userId))
    .returning({ id: user.id });
  if (updated.length === 0) {
    // The account went away between the read and the write.
    await forget(url, storage);
    throw new Error("not-found");
  }
  await forget(previous, storage);
  return url;
}

// Back to initials. Throws Error("not-found") if the user row is gone.
export async function removeAvatar(
  userId: string,
  storage: AvatarStorage | null = avatarStorage,
): Promise<void> {
  const previous = await currentImage(userId);
  await db.update(user).set({ image: null }).where(eq(user.id, userId));
  if (storage) await forget(previous, storage);
}
```

- [ ] **Step 5: Run** the unit test. Expected: PASS.

- [ ] **Step 6: Failing integration test** `tests/integration/avatars.test.ts`:

```ts
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { AvatarStorage } from "@/lib/avatar-storage";
import { AVATAR_SIZE, removeAvatar, saveAvatar } from "@/lib/avatars";

const GOOGLE = "https://lh3.googleusercontent.com/a/photo";

async function mkUser(id: string, image: string | null = null) {
  await db.execute(sql`insert into "user" (id, name, email, email_verified, image, created_at, updated_at)
    values (${id}, ${id}, ${id + "@example.com"}, true, ${image}, now(), now())
    on conflict (id) do update set image = ${image}`);
  return id;
}

async function imageOf(id: string) {
  const { rows } = await db.execute(sql`select image from "user" where id = ${id}`);
  return (rows[0] as { image: string | null }).image;
}

// Records what it was asked to do; URLs look like fake:<pathname>.
function fakeStorage() {
  const puts: { pathname: string; bytes: Buffer; contentType: string }[] = [];
  const dels: string[] = [];
  const storage: AvatarStorage = {
    async put(pathname, bytes, contentType) {
      puts.push({ pathname, bytes, contentType });
      return `fake:${pathname}`;
    },
    async del(url) {
      dels.push(url);
    },
    owns: (url) => url.startsWith("fake:"),
  };
  return { storage, puts, dels };
}

let png: Buffer;
beforeAll(async () => {
  png = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#cc3333" } }).png().toBuffer();
});

describe("saveAvatar", () => {
  let fake: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    fake = fakeStorage();
  });

  it("stores the processed photo under the user's path and points the row at it", async () => {
    const ivy = await mkUser("u_av_ivy");
    const url = await saveAvatar(ivy, png, fake.storage);
    expect(url).toMatch(/^fake:avatars\/u_av_ivy\/[0-9a-f-]{36}\.webp$/);
    expect(await imageOf(ivy)).toBe(url);
    expect(fake.puts).toHaveLength(1);
    expect(fake.puts[0].contentType).toBe("image/webp");
    const meta = await sharp(fake.puts[0].bytes).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", AVATAR_SIZE, AVATAR_SIZE]);
    expect(fake.dels).toEqual([]);
  });

  it("deletes the previous photo of ours after replacing it", async () => {
    const jon = await mkUser("u_av_jon", "fake:avatars/u_av_jon/old.webp");
    const url = await saveAvatar(jon, png, fake.storage);
    expect(await imageOf(jon)).toBe(url);
    expect(fake.dels).toEqual(["fake:avatars/u_av_jon/old.webp"]);
  });

  it("leaves a Google photo alone when replacing it", async () => {
    const kim = await mkUser("u_av_kim", GOOGLE);
    await saveAvatar(kim, png, fake.storage);
    expect(fake.dels).toEqual([]);
  });

  it("refuses when photos are off", async () => {
    const lee = await mkUser("u_av_lee");
    await expect(saveAvatar(lee, png, null)).rejects.toThrow("unavailable");
    expect(await imageOf(lee)).toBeNull();
  });

  it("refuses a user that doesn't exist, storing nothing", async () => {
    await expect(saveAvatar("u_av_nobody", png, fake.storage)).rejects.toThrow("not-found");
    expect(fake.puts).toEqual([]);
  });

  it("refuses bytes that aren't an image, storing nothing", async () => {
    const max = await mkUser("u_av_max");
    await expect(saveAvatar(max, Buffer.from("nope"), fake.storage)).rejects.toThrow("unreadable-image");
    expect(fake.puts).toEqual([]);
    expect(await imageOf(max)).toBeNull();
  });
});

describe("removeAvatar", () => {
  it("clears the row and deletes a photo of ours", async () => {
    const fake = fakeStorage();
    const ned = await mkUser("u_av_ned", "fake:avatars/u_av_ned/x.webp");
    await removeAvatar(ned, fake.storage);
    expect(await imageOf(ned)).toBeNull();
    expect(fake.dels).toEqual(["fake:avatars/u_av_ned/x.webp"]);
  });

  it("clears a Google photo without deleting anything", async () => {
    const fake = fakeStorage();
    const ola = await mkUser("u_av_ola", GOOGLE);
    await removeAvatar(ola, fake.storage);
    expect(await imageOf(ola)).toBeNull();
    expect(fake.dels).toEqual([]);
  });

  it("still clears the row when photos are off", async () => {
    const pat = await mkUser("u_av_pat", GOOGLE);
    await removeAvatar(pat, null);
    expect(await imageOf(pat)).toBeNull();
  });

  it("refuses a user that doesn't exist", async () => {
    await expect(removeAvatar("u_av_nobody", fakeStorage().storage)).rejects.toThrow("not-found");
  });
});
```

- [ ] **Step 7: Run** `./node_modules/.bin/vitest run tests/integration/avatars.test.ts` (unsandboxed, DB up). Expected: PASS (the implementation is already in). If any case fails, fix the implementation, not the test.

- [ ] **Step 8: Commit**: `Avatar domain: process with sharp, store, replace, remove`.

---

### Task 5: Lock the Better Auth update-user endpoint

**Files:**
- Modify: `src/lib/auth.ts`
- Create: `tests/integration/auth-update-user.test.ts`

**Interfaces:**
- Produces: nothing new. `/update-user` with `image` in the body answers 400.

- [ ] **Step 1: Failing integration test** `tests/integration/auth-update-user.test.ts`. It signs in for real through the emailed-code flow, reading the code back from the `verification` table (the plugin stores OTPs plain by default):

```ts
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auth } from "@/lib/auth";

// Signs a fresh account in through the emailed-code flow and returns the
// Cookie header a browser would send afterwards.
async function signedInHeaders(email: string): Promise<Headers> {
  await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
  const { rows } = await db.execute(
    sql`select value from verification where identifier = ${"sign-in-otp-" + email} order by created_at desc limit 1`,
  );
  const otp = (rows[0] as { value: string }).value.split(":")[0];
  const { headers } = await auth.api.signInEmailOTP({ body: { email, otp }, returnHeaders: true });
  const cookie = headers.get("set-cookie")!.split(";")[0];
  return new Headers({ cookie });
}

describe("the update-user endpoint", () => {
  it("still lets the Welcome screen set a name", async () => {
    const email = `upd-name-${crypto.randomUUID()}@example.com`;
    const headers = await signedInHeaders(email);
    await auth.api.updateUser({ body: { name: "Quinn" }, headers });
    const { rows } = await db.execute(sql`select name from "user" where email = ${email}`);
    expect((rows[0] as { name: string }).name).toBe("Quinn");
  });

  it("refuses an image from the browser: photos only come through saveAvatar", async () => {
    const email = `upd-image-${crypto.randomUUID()}@example.com`;
    const headers = await signedInHeaders(email);
    await expect(
      auth.api.updateUser({ body: { image: "https://evil.example/pixel.gif" }, headers }),
    ).rejects.toMatchObject({ status: "BAD_REQUEST" });
    const { rows } = await db.execute(sql`select image from "user" where email = ${email}`);
    expect((rows[0] as { image: string | null }).image).toBeNull();
  });
});
```

If the identifier format differs (check `toOTPIdentifier` in `node_modules/better-auth/dist/plugins/email-otp/`), adjust the `where` clause to match; the test's job is the two assertions.

- [ ] **Step 2: Run** it (unsandboxed). Expected: the name case passes, the image case FAILS (the image is saved).

- [ ] **Step 3: Add the hook** in `src/lib/auth.ts`. Import `APIError` and `createAuthMiddleware` from `"better-auth/api"`, and add to the `betterAuth({...})` options:

```ts
  hooks: {
    // Better Auth's own /update-user endpoint accepts `image` from the
    // browser, which would let any member point their avatar at any URL and
    // have every other member's browser load it. Photos only come through
    // saveAvatar (src/lib/avatars.ts), which writes the row directly. Google
    // sign-up sets the image through createOAuthUser, not this endpoint.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/update-user" && ctx.body && "image" in ctx.body) {
        throw new APIError("BAD_REQUEST", { message: "Photos are changed from Settings." });
      }
    }),
  },
```

- [ ] **Step 4: Run** the test. Expected: PASS. Run `./node_modules/.bin/vitest run tests/integration` to be sure nothing else changed. Commit: `Refuse image updates through Better Auth's update-user endpoint`.

---

### Task 6: `requireAccount` and the server actions

**Files:**
- Modify: `src/lib/dal.ts`, `src/app/(app)/settings/actions.ts`

**Interfaces:**
- Consumes: `avatarForm`, `saveAvatar`, `removeAvatar`, `UNREADABLE_PHOTO` (Task 4)
- Produces:
  ```ts
  requireAccount(): Promise<SessionUser>   // signed in, name not required
  updateAvatarAction(_prev: ActionState, formData: FormData): Promise<ActionState>
  removeAvatarAction(_prev: ActionState, _formData: FormData): Promise<ActionState>
  ```
  `ActionState` is the existing `{ error: string | null; success: boolean }` from `src/app/(app)/group/actions.ts`; re-export it from settings actions.

- [ ] **Step 1: Add to `src/lib/dal.ts`**, after `requireUser`:

```ts
// Signed in, name not required. The photo actions run from the Welcome screen,
// before a member has a name, where requireUser would redirect them straight
// back to Welcome.
export async function requireAccount() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  Sentry.setUser({ id: session.user.id });
  return session.user;
}
```

- [ ] **Step 2: Add the actions** to `src/app/(app)/settings/actions.ts`:

```ts
import { revalidatePath } from "next/cache";
import { requireAccount, requireUser } from "@/lib/dal";
import { avatarForm, removeAvatar, saveAvatar } from "@/lib/avatars";
import type { ActionState } from "@/app/(app)/group/actions";

export type { ActionState };

// Domain refusals from src/lib/avatars.ts mapped to copy the picker shows
// inline; anything else rethrows to the error boundary.
function mapAvatarError(err: unknown): string {
  logRefusal(err);
  if (err instanceof Error) {
    if (err.message === "unreadable-image") return UNREADABLE_PHOTO;
    if (err.message === "unavailable") return "Photos aren't available right now.";
    if (err.message === "not-found") return "That didn't work. Try refreshing the page.";
  }
  throw err;
}

// Photos show wherever names do, all under (app), plus the Welcome screen
// where the first one is added. Same (app) scope as a name change, for the
// same reason (src/revalidation.test.ts).
function revalidateAvatars() {
  revalidatePath("/(app)", "layout");
  revalidatePath("/welcome");
}

export async function updateAvatarAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const account = await requireAccount();
  const form = avatarForm.safeParse(Object.fromEntries(formData));
  if (!form.success) return { error: form.error.issues[0].message, success: false };
  try {
    await saveAvatar(account.id, Buffer.from(await form.data.photo.arrayBuffer()));
  } catch (err) {
    return { error: mapAvatarError(err), success: false };
  }
  revalidateAvatars();
  return { error: null, success: true };
}

export async function removeAvatarAction(
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const account = await requireAccount();
  try {
    await removeAvatar(account.id);
  } catch (err) {
    return { error: mapAvatarError(err), success: false };
  }
  revalidateAvatars();
  return { error: null, success: true };
}
```
(`UNREADABLE_PHOTO` imported from `@/lib/avatars` too.)

- [ ] **Step 3: Run** `./node_modules/.bin/tsc --noEmit` and `./node_modules/.bin/vitest run src/revalidation.test.ts`. Expected: clean. Commit: `Photo actions: update and remove`.

---

### Task 7: The Avatar component and the three rows

**Files:**
- Create: `src/components/avatar.tsx`
- Modify: `src/lib/groups.ts` (`listMembers`, `listPendingRequests`), `src/lib/meals.ts` (`MealPlanItem`, `getMealPlan`), `src/components/member-row.tsx`, `src/components/pending-request-row.tsx`, `src/components/meal-slot-row.tsx`
- Modify tests: `tests/integration/groups.test.ts`, `tests/integration/meals.test.ts` (one assertion each)

**Interfaces:**
- Produces: `<Avatar name image className? />` with `image: string | null`. `listMembers` rows gain `image`, `listPendingRequests` rows gain `image`, `MealPlanItem` gains `claimedByImage: string | null`.

- [ ] **Step 1: Failing integration assertions.** In `tests/integration/meals.test.ts`, the test "getMealPlan reports who claimed an item, by name": extend the first `toMatchObject` with `claimedByImage: null` and the second with `claimedByImage: null`. In `tests/integration/groups.test.ts`, find the `listMembers` assertion and add `image: null` to the expected member shape (read the file; if it uses `toMatchObject` on names only, add a new `it("includes each member's photo URL")` that sets `image` on one user via SQL and expects it back). Run them: FAIL.

- [ ] **Step 2: Queries.** `src/lib/groups.ts`: add `image: user.image,` after `name: user.name,` in both `listMembers` and `listPendingRequests`. `src/lib/meals.ts`: add `claimedByImage: string | null;` to `MealPlanItem` and `claimedByImage: claimer.image,` after `claimedByName: claimer.name,` in `getMealPlan`. Run the two tests: PASS.

- [ ] **Step 3: Avatar component** `src/components/avatar.tsx`:

```tsx
"use client";

import { useState } from "react";
import { UserRoundIcon } from "lucide-react";
import { cn, initials } from "@/lib/utils";

// One member's avatar: their photo when they have one, initials otherwise,
// and initials again if the photo fails to load (an expired Google URL). The
// only place avatar markup lives; size with className (size-8 text-xs is the
// row default).
export function Avatar({
  name,
  image,
  className,
}: {
  name: string;
  image: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = image !== null && failed !== image;
  const label = initials(name);

  return (
    <div
      className={cn(
        "bg-avatar text-avatar-foreground flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold",
        className,
      )}
    >
      {showImage ? (
        // The name is always beside the avatar, so the image is decorative.
        // A plain <img>: one fixed 256px file from a CDN, which next/image
        // would only re-encode on every render.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          referrerPolicy="no-referrer"
          draggable={false}
          className="size-full object-cover"
          onError={() => setFailed(image)}
        />
      ) : label === "?" ? (
        <UserRoundIcon className="size-1/2" aria-hidden />
      ) : (
        label
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rows.**

`src/components/member-row.tsx`: add `image: string | null;` to `MemberRowMember`; import `Avatar`; replace the avatar `div` so the self bubble stays and others get the photo:

```tsx
        {isSelf ? (
          <div className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold">
            You
          </div>
        ) : (
          <Avatar name={member.name} image={member.image} />
        )}
```
Drop the now-unused `initials` import (keep `cn`).

`src/components/pending-request-row.tsx`: add `image: string | null;` to `PendingRequest`; replace the initials `div` with `<Avatar name={request.name} image={request.image} />`; drop the `initials` import.

`src/components/meal-slot-row.tsx`: `type Claim = { by: string | null; name: string | null; image: string | null };` `const truth: Claim = { by: item.claimedBy, name: item.claimedByName, image: item.claimedByImage };` In `onClaim`: `setOptimistic({ by: currentUserId, name: "You", image: null });` In `onRelease`: `setOptimistic({ by: null, name: null, image: null });` Replace the claimed bubble:

```tsx
        {claimed ? (
          mine ? (
            <div className="bg-avatar text-avatar-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold">
              You
            </div>
          ) : (
            <Avatar name={optimistic.name ?? "?"} image={optimistic.image} className="size-9" />
          )
        ) : (
```
Drop the `initials` import.

- [ ] **Step 5: Run** `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/eslint .`, `./node_modules/.bin/vitest run` (unsandboxed). Expected: clean; `button-styling.test.ts` still passes. Commit: `Show photos on the member list, meal claims, and join requests`.

---

### Task 8: Crop dialog

**Files:**
- Create: `src/components/crop-dialog.tsx`

**Interfaces:**
- Consumes: `src/lib/crop.ts` (Task 2)
- Produces: `<CropDialog file onCancel onCrop onUnreadable />` where `file: File | null` (open while non-null), `onCrop(photo: Blob)`, `onUnreadable()`. Exports `CROP_OUTPUT_SIZE = 512`.

- [ ] **Step 1: Implement** `src/components/crop-dialog.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  clampOffset,
  coverScale,
  MAX_ZOOM,
  MIN_ZOOM,
  sourceRect,
  zoomAround,
  type CropState,
  type Offset,
} from "@/lib/crop";

// Pixels in the JPEG handed back. Twice the stored size (src/lib/avatars.ts),
// so the server's final downscale averages out JPEG artifacts.
export const CROP_OUTPUT_SIZE = 512;
// The square the member frames their face in. Fits the dialog on a 375px
// phone (375 - 2 * 16 margin - 2 * 16 padding = 311) with room to spare.
const VIEWPORT = 280;

const INITIAL: CropState = { zoom: 1, offset: { x: 0, y: 0 } };

type Size = { w: number; h: number };
type Pointer = { x: number; y: number };

function distance(a: Pointer, b: Pointer) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Pointer, b: Pointer): Pointer {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// Frame a photo inside a circle, by dragging and pinching (or the slider and
// the wheel on a desktop), then hand back the framed square as a JPEG.
// Geometry lives in src/lib/crop.ts; this file is the wiring.
export function CropDialog({
  file,
  onCancel,
  onCrop,
  onUnreadable,
}: {
  file: File | null;
  onCancel: () => void;
  onCrop: (photo: Blob) => void;
  onUnreadable: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [state, setState] = useState<CropState>(INITIAL);
  const [exporting, setExporting] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  // Every pointer currently down on the viewport, by pointerId.
  const pointers = useRef(new Map<number, Pointer>());

  // One object URL per file, revoked when the file changes or the dialog
  // closes. Size and framing reset with it.
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSrc(url);
    setSize(null);
    setState(INITIAL);
    pointers.current.clear();
    return () => {
      URL.revokeObjectURL(url);
      setSrc(null);
    };
  }, [file]);

  // React registers wheel listeners as passive, so preventDefault (which
  // stops the page behind the dialog from scrolling) needs a native one.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !size) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const point = { x: e.clientX - rect.left - VIEWPORT / 2, y: e.clientY - rect.top - VIEWPORT / 2 };
      const factor = Math.exp(-e.deltaY * 0.002);
      setState((s) => zoomAround(s, factor, point, size.w, size.h, VIEWPORT));
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [size]);

  // Pointer positions relative to the viewport's centre, the frame
  // src/lib/crop.ts works in.
  function localPoint(e: React.PointerEvent): Pointer {
    const rect = viewportRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left - VIEWPORT / 2, y: e.clientY - rect.top - VIEWPORT / 2 };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!size) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, localPoint(e));
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!size) return;
    const previous = pointers.current.get(e.pointerId);
    if (!previous) return;
    const current = localPoint(e);
    const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId);
    pointers.current.set(e.pointerId, current);

    if (others.length === 0) {
      // One finger: drag.
      setState((s) => ({
        zoom: s.zoom,
        offset: clampOffset(
          { x: s.offset.x + current.x - previous.x, y: s.offset.y + current.y - previous.y },
          size.w,
          size.h,
          VIEWPORT,
          s.zoom,
        ),
      }));
      return;
    }

    // Two fingers: zoom by how much they spread, around their midpoint, and
    // pan by how much the midpoint moved. (A third finger is ignored.)
    const [, other] = others[0];
    const before = { distance: distance(previous, other), mid: midpoint(previous, other) };
    const after = { distance: distance(current, other), mid: midpoint(current, other) };
    if (before.distance === 0) return;
    setState((s) => {
      const zoomed = zoomAround(s, after.distance / before.distance, before.mid, size.w, size.h, VIEWPORT);
      const panned: Offset = {
        x: zoomed.offset.x + after.mid.x - before.mid.x,
        y: zoomed.offset.y + after.mid.y - before.mid.y,
      };
      return { zoom: zoomed.zoom, offset: clampOffset(panned, size.w, size.h, VIEWPORT, zoomed.zoom) };
    });
  }

  function onPointerEnd(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
  }

  function onSlider(e: React.ChangeEvent<HTMLInputElement>) {
    if (!size) return;
    const zoom = Number(e.target.value);
    setState((s) => zoomAround(s, zoom / s.zoom, { x: 0, y: 0 }, size.w, size.h, VIEWPORT));
  }

  async function confirm() {
    const img = imgRef.current;
    if (!img || !size) return;
    setExporting(true);
    try {
      const rect = sourceRect(state, size.w, size.h, VIEWPORT);
      const canvas = document.createElement("canvas");
      canvas.width = CROP_OUTPUT_SIZE;
      canvas.height = CROP_OUTPUT_SIZE;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, rect.x, rect.y, rect.size, rect.size, 0, 0, CROP_OUTPUT_SIZE, CROP_OUTPUT_SIZE);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9),
      );
      if (!blob) {
        onUnreadable();
        return;
      }
      onCrop(blob);
    } finally {
      setExporting(false);
    }
  }

  const scale = size ? coverScale(size.w, size.h, VIEWPORT) * state.zoom : 1;

  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="font-serif text-xl font-semibold">Frame your photo</DialogTitle>
          <DialogDescription>Drag to move. Pinch or use the slider to zoom.</DialogDescription>
        </DialogHeader>

        {/* touch-action: none keeps the browser from scrolling or zooming the
            page while a finger is on the photo. The dark ring is a circle
            with an enormous shadow: everything outside it is what gets cut. */}
        <div
          ref={viewportRef}
          data-testid="crop-viewport"
          className="bg-muted relative mx-auto overflow-hidden rounded-xl select-none touch-none"
          style={{ width: VIEWPORT, height: VIEWPORT }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          {src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              src={src}
              alt=""
              draggable={false}
              onLoad={(e) => {
                const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                if (w === 0 || h === 0) onUnreadable();
                else setSize({ w, h });
              }}
              onError={onUnreadable}
              className="pointer-events-none absolute top-1/2 left-1/2 h-auto max-w-none"
              style={
                size
                  ? {
                      width: size.w * scale,
                      height: size.h * scale,
                      transform: `translate(calc(-50% + ${state.offset.x}px), calc(-50% + ${state.offset.y}px))`,
                    }
                  : { visibility: "hidden" }
              }
            />
          )}
          <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgba(0,0,0,0.45)]" />
        </div>

        <label className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">Zoom</span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={state.zoom}
            onChange={onSlider}
            disabled={!size}
            className="accent-primary flex-1"
          />
        </label>

        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" className="flex-1" onClick={confirm} disabled={!size || exporting}>
            Use photo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Run** `./node_modules/.bin/tsc --noEmit` and `./node_modules/.bin/eslint src/components/crop-dialog.tsx`. Expected: clean. Commit: `Crop dialog: drag, pinch, slider, and export`.

---

### Task 9: Avatar picker, Profile card, Welcome, Settings

**Files:**
- Create: `src/components/avatar-picker.tsx`
- Rename: `src/components/display-name-card.tsx` to `src/components/profile-card.tsx` (`DisplayNameCard` becomes `ProfileCard`)
- Modify: `src/app/(app)/settings/page.tsx`, `src/app/(auth)/welcome/page.tsx`

**Interfaces:**
- Consumes: `CropDialog`, `Avatar`, `updateAvatarAction`, `removeAvatarAction`, `avatarsEnabled`
- Produces: `<AvatarPicker name image enabled />`, `<ProfileCard name email image enabled />`

- [ ] **Step 1: Picker** `src/components/avatar-picker.tsx`:

```tsx
"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { CropDialog } from "@/components/crop-dialog";
import { Button } from "@/components/ui/button";
import {
  removeAvatarAction,
  updateAvatarAction,
  type ActionState,
} from "@/app/(app)/settings/actions";

const initialState: ActionState = { error: null, success: false };

// Refused before the file is even read: the cropper decodes the whole photo
// in memory, and nothing a phone takes is this big.
const MAX_PICK_BYTES = 20 * 1024 * 1024;
const UNREADABLE = "That photo couldn't be read. Try a JPEG or PNG.";

// The member's own photo, with the controls to change it. Used on Welcome and
// on the Settings profile card. Choosing a file opens the crop dialog;
// confirming the crop uploads straight away, so the server re-renders with
// the new photo and nothing here has to remember it. `enabled` is false when
// photos are off (Vercel without a Blob store): the avatar still shows.
export function AvatarPicker({
  name,
  image,
  enabled,
}: {
  name: string;
  image: string | null;
  enabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [saveState, save, saving] = useActionState(updateAvatarAction, initialState);
  const [removeState, remove, removing] = useActionState(removeAvatarAction, initialState);

  // The newest message wins: a picker error clears when an action starts,
  // and an action's error shows until the next attempt.
  const [seen, setSeen] = useState({ save: saveState, remove: removeState });
  if (seen.save !== saveState || seen.remove !== removeState) {
    setSeen({ save: saveState, remove: removeState });
    setLocalError(null);
  }
  const error = localError ?? (seen.save === saveState ? saveState.error : null) ?? removeState.error;
  const busy = saving || removing;

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    e.target.value = "";
    if (!picked) return;
    if (picked.size > MAX_PICK_BYTES) {
      setLocalError("That photo is too large. Pick one under 20 MB.");
      return;
    }
    setLocalError(null);
    setFile(picked);
  }

  function onCrop(photo: Blob) {
    setFile(null);
    const formData = new FormData();
    formData.append("photo", photo, "avatar.jpg");
    startTransition(() => save(formData));
  }

  function onUnreadable() {
    setFile(null);
    setLocalError(UNREADABLE);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Avatar
          name={name}
          image={image}
          className={busy ? "size-16 text-lg opacity-50" : "size-16 text-lg"}
        />
        {enabled && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="pill"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {image ? "Change photo" : "Add a photo"}
            </Button>
            {image && (
              <Button
                type="button"
                variant="outline"
                size="pill"
                disabled={busy}
                onClick={() => startTransition(() => remove(new FormData()))}
              >
                Remove photo
              </Button>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Choose a photo"
        onChange={onPick}
      />
      <CropDialog file={file} onCancel={() => setFile(null)} onCrop={onCrop} onUnreadable={onUnreadable} />
    </div>
  );
}
```

- [ ] **Step 2: Profile card.** `git mv src/components/display-name-card.tsx src/components/profile-card.tsx`. Rename the component to `ProfileCard`, add `image: string | null; enabled: boolean` props, import `AvatarPicker`, and change the markup so the card holds two rows:

```tsx
    <div className="bg-card rounded-card shadow-card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-muted-foreground tracking-label text-xs uppercase">You</p>
          <p className="text-strong truncate font-medium">{name}</p>
          <p className="text-tertiary truncate text-xs">{email}</p>
        </div>
        <Button type="button" variant="secondary" size="pill" onClick={() => setOpen(true)}>
          Edit name
        </Button>
      </div>
      <AvatarPicker name={name} image={image} enabled={enabled} />

      <Dialog ...unchanged... />
    </div>
```
Update the header comment: the card is the member as the group sees them, name and photo. Update the `ALLOWED` map in `src/components/button-styling.test.ts` only if the test reports the file (it should not: the file input is not an interactive tag it scans).

- [ ] **Step 3: Settings page.** In `src/app/(app)/settings/page.tsx` import `ProfileCard` and `avatarsEnabled` (`@/lib/avatar-storage`) and render `<ProfileCard name={user.name} email={user.email} image={user.image ?? null} enabled={avatarsEnabled} />`.

- [ ] **Step 4: Welcome page.** In `src/app/(auth)/welcome/page.tsx` import `AvatarPicker` and `avatarsEnabled`. Between the heading block and the form:

```tsx
      {(avatarsEnabled || session.user.image) && (
        <div className="mx-auto flex w-full max-w-sm flex-col gap-2">
          <AvatarPicker name="" image={session.user.image ?? null} enabled={avatarsEnabled} />
          <p className="text-tertiary text-xs">Add a photo so the group knows your face. Optional.</p>
        </div>
      )}
```

- [ ] **Step 5: Run** `tsc`, `eslint .`, `vitest run` (unsandboxed). Expected: clean. Commit: `Photo picker on Welcome and the Settings profile card`.

---

### Task 10: What's new and docs

**Files:**
- Modify: `src/lib/whats-new.ts`, `CLAUDE.md`

- [ ] **Step 1:** Add at the top of `releases`:

```ts
  {
    id: 6,
    date: "2026-10-11",
    title: "Put a face to your name",
    body: "Add a photo of yourself from Settings and the group sees it next to your name on the member list and meal sign-ups. Signed in with Google? Your Google photo shows until you pick another.",
  },
```

- [ ] **Step 2:** Add to CLAUDE.md conventions: `- Profile photos: src/lib/avatars.ts (sharp normalizes to 256px WebP, writes user.image) over src/lib/avatar-storage.ts (Vercel Blob with BLOB_READ_WRITE_TOKEN, inline data URLs locally and in CI, off on Vercel without the token). Render with <Avatar>; never write user.image any other way (Better Auth's update-user refuses image).`

- [ ] **Step 3:** `vitest run src/lib/whats-new.test.ts`. Commit: `What's new: profile photos`.

---

### Task 11: End-to-end

**Files:**
- Create: `e2e/profile-photo.spec.ts`

- [ ] **Step 1: Write the spec.** A PNG is generated in the test with `sharp` (a devDependency available to Playwright):

```ts
import sharp from "sharp";
import { expect, test } from "@playwright/test";
import { expectApp, memberContext, signIn } from "./helpers";

// A photo wide enough that the cropper has something to frame.
async function photo() {
  return {
    name: "me.png",
    mimeType: "image/png",
    buffer: await sharp({ create: { width: 600, height: 400, channels: 3, background: "#4466cc" } })
      .png()
      .toBuffer(),
  };
}

test("a member adds a photo on Welcome, the group sees it, and removing it brings initials back", async ({
  browser,
}) => {
  const run = Date.now();
  const ana = await (await memberContext(browser)).newPage();

  // Welcome: the photo first, then the name.
  await signInToWelcome(ana, `photo-ana-${run}@example.com`);
  await ana.getByLabel("Choose a photo").setInputFiles(await photo());
  const dialog = ana.getByRole("dialog", { name: "Frame your photo" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Use photo" }).click();
  await expect(dialog).toBeHidden();
  const welcomeAvatar = ana.locator("img[alt='']").first();
  await expectApp(welcomeAvatar).toBeVisible();
  await expect(ana.getByRole("button", { name: "Change photo" })).toBeVisible();
  await ana.getByLabel("Display name").fill("Ana");
  await ana.getByRole("button", { name: "Continue" }).click();
  await ana.waitForURL((url) => url.pathname !== "/welcome");

  await ana.getByRole("link", { name: "Create a group" }).click();
  await ana.getByLabel("Group name").fill(`Photos ${run}`);
  await ana.getByRole("button", { name: "Create group" }).click();
  await expectApp(ana.getByRole("heading", { name: `Photos ${run}` })).toBeVisible();

  // Settings shows it with both controls.
  await ana.getByRole("link", { name: "Settings" }).click();
  await expectApp(ana.getByRole("button", { name: "Change photo" })).toBeVisible();
  await expect(ana.getByRole("button", { name: "Remove photo" })).toBeVisible();

  // Ben joins and sees Ana's photo on the member list.
  await ana.getByRole("link", { name: "Group" }).click();
  const inviteUrl = await ana.getByTestId("invite-url").innerText();
  const ben = await (await memberContext(browser)).newPage();
  await signIn(ben, `photo-ben-${run}@example.com`, "Ben");
  await ben.goto(new URL(inviteUrl).pathname);
  await ben.getByRole("button", { name: "Ask to join" }).click();
  await expectApp(ben.getByText("Waiting for approval")).toBeVisible();
  await ana.reload();
  await ana.getByRole("button", { name: "Approve" }).click();
  await expectApp(ana.getByTestId("member-row").filter({ hasText: "Ben" })).toBeVisible();
  await ben.getByRole("link", { name: "Group" }).click();
  const anaRow = ben.getByTestId("member-row").filter({ hasText: "Ana" });
  await expectApp(anaRow.locator("img")).toBeVisible();

  // Ana removes it; Ben sees initials.
  await ana.getByRole("link", { name: "Settings" }).click();
  await ana.getByRole("button", { name: "Remove photo" }).click();
  await expectApp(ana.getByRole("button", { name: "Add a photo" })).toBeVisible();
  await ben.reload();
  await expectApp(anaRow).toBeVisible();
  await expect(anaRow.locator("img")).toHaveCount(0);
  await expect(anaRow.getByText("AN", { exact: true })).toBeVisible();
});

// signIn() fills the name on Welcome; this test wants to stop there.
async function signInToWelcome(page: import("@playwright/test").Page, email: string) {
  const { requestCode, latestCode } = await import("./helpers");
  await requestCode(page, email);
  await page.getByLabel("Sign-in code").fill(latestCode(email));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/welcome/);
}
```
(Import `requestCode` and `latestCode` statically with the other helpers instead of the dynamic import; the snippet shows intent.)

- [ ] **Step 2: Run** the suite against a production build on a port no other worktree uses (see memory: a scratch Playwright config that spreads `playwright.config.ts` and moves baseURL, `webServer.url`, `BETTER_AUTH_URL`, and `PORT` to 3300 with `reuseExistingServer: false`). `mise exec -- ./node_modules/.bin/next build` then `mise exec -- ./node_modules/.bin/playwright test -c <scratch config> e2e/profile-photo.spec.ts`, then the whole suite. Expected: PASS. Delete the scratch config. Commit: `e2e: profile photo from Welcome to the member list and back`.

---

### Task 12: Full verification and PR

- [ ] `mise run lint`, `mise run typecheck`, `mise run test`, `mise run build`, full e2e. All green with output in hand.
- [ ] Manual check in the browser pane against `next dev`: Welcome with a photo, Settings change and remove, member list and a claimed meal slot as a second member, dark mode, a 375px viewport for the crop dialog.
- [ ] Push and open the PR with a summary, the rollout steps from the spec (create the Blob store, connect it, redeploy), and the note that `putImage` was replaced by `sharp` and why. Stop at PR-ready; the owner merges.
