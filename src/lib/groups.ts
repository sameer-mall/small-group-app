import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { inviteCodes, joinRequests } from "@/db/schema";
import { member, organization } from "@/db/auth-schema";

type Role = "admin" | "member";

export function newInviteCode(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

export async function createGroup(userId: string, name: string) {
  const groupId = crypto.randomUUID();
  const slug =
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) +
    "-" + newInviteCode().slice(0, 6);
  await db.transaction(async (tx) => {
    await tx.insert(organization).values({ id: groupId, name, slug, createdAt: new Date() });
    await tx.insert(member).values({
      id: crypto.randomUUID(), organizationId: groupId, userId,
      role: "admin", createdAt: new Date(),
    });
    await tx.insert(inviteCodes).values({ groupId, code: newInviteCode() });
  });
  return { groupId };
}

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

export async function listMembers(groupId: string) {
  return db
    .select({
      userId: member.userId,
      role: member.role,
      createdAt: member.createdAt,
    })
    .from(member)
    .where(eq(member.organizationId, groupId));
}

export async function listPendingRequests(groupId: string) {
  return db
    .select()
    .from(joinRequests)
    .where(and(eq(joinRequests.groupId, groupId), eq(joinRequests.status, "pending")));
}

export async function adminCount(groupId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(member)
    .where(and(eq(member.organizationId, groupId), eq(member.role, "admin")));
  return row?.count ?? 0;
}

export async function requestToJoin(userId: string, code: string) {
  const [invite] = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code));
  if (!invite) throw new Error("not-found");
  const groupId = invite.groupId;

  const existingMembership = await getMembership(groupId, userId);
  if (existingMembership) throw new Error("already-member");

  const [existingPending] = await db
    .select()
    .from(joinRequests)
    .where(
      and(
        eq(joinRequests.groupId, groupId),
        eq(joinRequests.userId, userId),
        eq(joinRequests.status, "pending"),
      ),
    );

  const [group] = await db.select().from(organization).where(eq(organization.id, groupId));
  if (!group) throw new Error("not-found");

  if (existingPending) {
    return { groupId, groupName: group.name };
  }

  await db.insert(joinRequests).values({ groupId, userId });
  return { groupId, groupName: group.name };
}

export async function approveRequest(userId: string, requestId: string) {
  const [req] = await db.select().from(joinRequests).where(eq(joinRequests.id, requestId));
  if (!req || req.status !== "pending") throw new Error("not-found");
  const actor = await getMembership(req.groupId, userId);
  if (actor?.role !== "admin") throw new Error("forbidden");
  await db.transaction(async (tx) => {
    const updated = await tx.update(joinRequests)
      .set({ status: "approved", respondedAt: new Date(), respondedBy: userId })
      .where(and(eq(joinRequests.id, requestId), eq(joinRequests.status, "pending")))
      .returning({ id: joinRequests.id });
    // Guard against a concurrent double-approve: if no pending row matched the
    // update (already responded to by another concurrent call), bail out
    // before inserting — otherwise this could insert a duplicate member row
    // (member has no unique (organization_id, user_id) constraint).
    if (updated.length === 0) throw new Error("not-found");
    await tx.insert(member).values({
      id: crypto.randomUUID(), organizationId: req.groupId, userId: req.userId,
      role: "member", createdAt: new Date(),
    });
  });
}

export async function denyRequest(userId: string, requestId: string) {
  const [req] = await db.select().from(joinRequests).where(eq(joinRequests.id, requestId));
  if (!req || req.status !== "pending") throw new Error("not-found");
  const actor = await getMembership(req.groupId, userId);
  if (actor?.role !== "admin") throw new Error("forbidden");
  await db
    .update(joinRequests)
    .set({ status: "denied", respondedAt: new Date(), respondedBy: userId })
    .where(and(eq(joinRequests.id, requestId), eq(joinRequests.status, "pending")));
}

async function requireAdminMembership(userId: string, groupId: string) {
  const actor = await getMembership(groupId, userId);
  if (actor?.role !== "admin") throw new Error("forbidden");
}

export async function promoteMember(userId: string, groupId: string, memberUserId: string) {
  await requireAdminMembership(userId, groupId);
  const target = await getMembership(groupId, memberUserId);
  if (!target) throw new Error("not-found");
  await db
    .update(member)
    .set({ role: "admin" })
    .where(and(eq(member.organizationId, groupId), eq(member.userId, memberUserId)));
}

export async function demoteMember(userId: string, groupId: string, memberUserId: string) {
  await requireAdminMembership(userId, groupId);
  const target = await getMembership(groupId, memberUserId);
  if (!target) throw new Error("not-found");
  await db.transaction(async (tx) => {
    // Lock the group's admin rows before counting so a concurrent
    // demote/remove/leave on the same group serializes behind this
    // transaction instead of racing past a stale admin count.
    const adminRows = await tx
      .select({ userId: member.userId })
      .from(member)
      .where(and(eq(member.organizationId, groupId), eq(member.role, "admin")))
      .for("update");
    const targetIsAdmin = adminRows.some((row) => row.userId === memberUserId);
    if (targetIsAdmin && adminRows.length === 1) {
      throw new Error("last-admin");
    }
    await tx
      .update(member)
      .set({ role: "member" })
      .where(and(eq(member.organizationId, groupId), eq(member.userId, memberUserId)));
  });
}

export async function removeMember(userId: string, groupId: string, memberUserId: string) {
  await requireAdminMembership(userId, groupId);
  const target = await getMembership(groupId, memberUserId);
  if (!target) throw new Error("not-found");
  await db.transaction(async (tx) => {
    // Same lock-then-count pattern as demoteMember — see comment there.
    const adminRows = await tx
      .select({ userId: member.userId })
      .from(member)
      .where(and(eq(member.organizationId, groupId), eq(member.role, "admin")))
      .for("update");
    const targetIsAdmin = adminRows.some((row) => row.userId === memberUserId);
    if (targetIsAdmin && adminRows.length === 1) {
      throw new Error("last-admin");
    }
    await tx
      .delete(member)
      .where(and(eq(member.organizationId, groupId), eq(member.userId, memberUserId)));
  });
}

export async function leaveGroup(userId: string, groupId: string) {
  const actor = await getMembership(groupId, userId);
  if (!actor) throw new Error("forbidden");
  await db.transaction(async (tx) => {
    // Same lock-then-count pattern as demoteMember — see comment there.
    const adminRows = await tx
      .select({ userId: member.userId })
      .from(member)
      .where(and(eq(member.organizationId, groupId), eq(member.role, "admin")))
      .for("update");
    const actorIsAdmin = adminRows.some((row) => row.userId === userId);
    if (actorIsAdmin && adminRows.length === 1) {
      throw new Error("last-admin");
    }
    await tx
      .delete(member)
      .where(and(eq(member.organizationId, groupId), eq(member.userId, userId)));
  });
}

export async function renameGroup(userId: string, groupId: string, name: string) {
  await requireAdminMembership(userId, groupId);
  await db.update(organization).set({ name }).where(eq(organization.id, groupId));
}

export async function rotateInviteCode(userId: string, groupId: string) {
  await requireAdminMembership(userId, groupId);
  const code = newInviteCode();
  await db
    .update(inviteCodes)
    .set({ code, rotatedAt: new Date() })
    .where(eq(inviteCodes.groupId, groupId));
  return { code };
}

export async function getInviteCode(groupId: string): Promise<string> {
  const [row] = await db.select().from(inviteCodes).where(eq(inviteCodes.groupId, groupId));
  if (!row) throw new Error("not-found");
  return row.code;
}
