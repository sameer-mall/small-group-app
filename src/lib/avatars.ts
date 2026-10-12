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
// back to initials. Nothing else writes user.image: Better Auth's own
// update-user endpoint refuses `image` (src/lib/auth.ts).

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
  const url = await storage.put(
    `avatars/${userId}/${crypto.randomUUID()}.webp`,
    bytes,
    CONTENT_TYPE,
  );
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
