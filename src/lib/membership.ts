import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { member } from "@/db/auth-schema";

// Group membership: the one place that answers "does this user belong to this
// group, and as what?" — and the guards every domain module builds on.
//
// This lives here rather than in a route middleware on purpose. Authorization
// in this app is per-resource ("is the actor a member of the group that owns
// *this* meeting?"), and middleware only sees a URL — it cannot know which
// group a `/meetings/<id>` request touches without re-querying, and it never
// sees which row a server action is about. Keeping the check next to the data
// means every path reaches it: pages, server actions, and one domain function
// calling another.
//
// Note the layering: these take an explicit `userId` and never read headers,
// so they stay unit-testable and callable from anywhere. The session-aware
// wrappers that resolve *who the caller is* live in `src/lib/dal.ts`.

export type Role = "admin" | "member";

export async function getMembership(
  groupId: string,
  userId: string,
): Promise<{ role: Role } | null> {
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, groupId), eq(member.userId, userId)));
  return row ? { role: row.role as Role } : null;
}

// Any member of the group. Throws "forbidden" for non-members.
export async function requireMembership(
  userId: string,
  groupId: string,
): Promise<{ role: Role }> {
  const membership = await getMembership(groupId, userId);
  if (!membership) throw new Error("forbidden");
  return membership;
}

// An admin of the group. Throws "forbidden" for members and non-members alike.
export async function requireAdminMembership(
  userId: string,
  groupId: string,
): Promise<{ role: Role }> {
  const membership = await getMembership(groupId, userId);
  if (membership?.role !== "admin") throw new Error("forbidden");
  return membership;
}
