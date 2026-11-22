import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { passkey } from "@/db/schema";

// Passkeys are listed and removed here rather than through the plugin's
// endpoints, so ownership is checked in our code (and tested) and the public
// key never leaves the server. Registration and sign-in stay with the plugin.

export type PasskeySummary = { id: string; name: string | null; createdAt: Date | null };

export async function passkeysFor(userId: string): Promise<PasskeySummary[]> {
  return db
    .select({ id: passkey.id, name: passkey.name, createdAt: passkey.createdAt })
    .from(passkey)
    .where(eq(passkey.userId, userId))
    .orderBy(asc(passkey.createdAt));
}

export async function ownsPasskey(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .select({ id: passkey.id })
    .from(passkey)
    .where(and(eq(passkey.id, id), eq(passkey.userId, userId)));
  return rows.length > 0;
}

// Takes effect at once: the next sign-in with this credential is refused.
export async function removePasskey(userId: string, id: string): Promise<void> {
  const rows = await db
    .delete(passkey)
    .where(and(eq(passkey.id, id), eq(passkey.userId, userId)))
    .returning({ id: passkey.id });
  if (rows.length === 0) throw new Error("not-found");
}

// Which of the member's passkeys this device most likely holds, for setting
// the sg_passkey cookie again after a passkey sign-in. Only a guess that
// can't be wrong: the member's only passkey, or the only one named for this
// kind of device. Otherwise null.
export async function passkeyForDevice(userId: string, deviceName: string): Promise<string | null> {
  const all = await passkeysFor(userId);
  if (all.length === 1) return all[0].id;
  const named = all.filter((p) => p.name === deviceName);
  return named.length === 1 ? named[0].id : null;
}
