import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { passkey } from "@/db/schema";

// Passkeys are listed and removed here rather than through the plugin's
// endpoints, so ownership is checked in our code (and tested) and the public
// key never leaves the server. Registration and sign-in stay with the plugin.

// Which passkey this device created (its row id), so the server can show
// Welcome back and "This iPhone". Set by the after hook in src/lib/auth.ts on
// a platform-passkey registration or sign-in, as a response header: Safari
// caps cookies written from JavaScript at 7 days. Survives sign-out on
// purpose. A row id is useless without the device's private key.
export const PASSKEY_COOKIE = "sg_passkey";

export type PasskeySummary = { id: string; name: string | null; createdAt: Date | null };

export async function passkeysFor(userId: string): Promise<PasskeySummary[]> {
  return db
    .select({ id: passkey.id, name: passkey.name, createdAt: passkey.createdAt })
    .from(passkey)
    .where(eq(passkey.userId, userId))
    .orderBy(asc(passkey.createdAt));
}

// The row for a WebAuthn credential id, which the plugin has just verified.
export async function passkeyIdForCredential(credentialID: string): Promise<string | null> {
  const [row] = await db
    .select({ id: passkey.id })
    .from(passkey)
    .where(eq(passkey.credentialID, credentialID))
    .limit(1);
  return row?.id ?? null;
}

// Takes effect at once: the next sign-in with this credential is refused.
export async function removePasskey(userId: string, id: string): Promise<void> {
  const rows = await db
    .delete(passkey)
    .where(and(eq(passkey.id, id), eq(passkey.userId, userId)))
    .returning({ id: passkey.id });
  if (rows.length === 0) throw new Error("not-found");
}
