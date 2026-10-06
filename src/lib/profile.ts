import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { user } from "@/db/schema";

// The name a member shows to their group (meal claims, prayers, member list).
// First collected on /welcome; changed later from the Group screen. Messages
// are user-facing copy (see CLAUDE.md on zod).
export const displayNameForm = z.object({
  name: z
    .string({ error: "Name can't be empty." })
    .trim()
    .min(1, "Name can't be empty.")
    .max(60, "Keep your name under 60 characters."),
});

// Writes the user table directly rather than going through Better Auth's
// updateUser endpoint: no hooks or extra fields are involved, and sessions
// read the user row on every request (no cookie cache), so the new name shows
// up immediately. Throws Error("not-found") if the user row is gone.
export async function updateDisplayName(userId: string, name: string) {
  const updated = await db
    .update(user)
    .set({ name })
    .where(eq(user.id, userId))
    .returning({ id: user.id });
  if (updated.length === 0) throw new Error("not-found");
}
