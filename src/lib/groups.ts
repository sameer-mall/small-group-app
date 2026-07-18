import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { inviteCodes, joinRequests } from "@/db/schema";
import { member, organization } from "@/db/auth-schema";

type Role = "admin" | "member";

export function newInviteCode(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

export async function createGroup(actorId: string, name: string) {
  const groupId = crypto.randomUUID();
  const slug =
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) +
    "-" + newInviteCode().slice(0, 6);
  await db.transaction(async (tx) => {
    await tx.insert(organization).values({ id: groupId, name, slug, createdAt: new Date() });
    await tx.insert(member).values({
      id: crypto.randomUUID(), organizationId: groupId, userId: actorId,
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

export async function requestToJoin(actorId: string, code: string) {
  const [invite] = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code));
  if (!invite) throw new Error("not-found");
  const groupId = invite.groupId;

  const existingMembership = await getMembership(groupId, actorId);
  if (existingMembership) throw new Error("already-member");

  const [existingPending] = await db
    .select()
    .from(joinRequests)
    .where(
      and(
        eq(joinRequests.groupId, groupId),
        eq(joinRequests.userId, actorId),
        eq(joinRequests.status, "pending"),
      ),
    );

  const [group] = await db.select().from(organization).where(eq(organization.id, groupId));
  if (!group) throw new Error("not-found");

  if (existingPending) {
    return { groupId, groupName: group.name };
  }

  await db.insert(joinRequests).values({ groupId, userId: actorId });
  return { groupId, groupName: group.name };
}

export async function approveRequest(actorId: string, requestId: string) {
  const [req] = await db.select().from(joinRequests).where(eq(joinRequests.id, requestId));
  if (!req || req.status !== "pending") throw new Error("not-found");
  const actor = await getMembership(req.groupId, actorId);
  if (actor?.role !== "admin") throw new Error("forbidden");
  await db.transaction(async (tx) => {
    await tx.update(joinRequests)
      .set({ status: "approved", respondedAt: new Date(), respondedBy: actorId })
      .where(and(eq(joinRequests.id, requestId), eq(joinRequests.status, "pending")));
    await tx.insert(member).values({
      id: crypto.randomUUID(), organizationId: req.groupId, userId: req.userId,
      role: "member", createdAt: new Date(),
    });
  });
}

export async function denyRequest(actorId: string, requestId: string) {
  const [req] = await db.select().from(joinRequests).where(eq(joinRequests.id, requestId));
  if (!req || req.status !== "pending") throw new Error("not-found");
  const actor = await getMembership(req.groupId, actorId);
  if (actor?.role !== "admin") throw new Error("forbidden");
  await db
    .update(joinRequests)
    .set({ status: "denied", respondedAt: new Date(), respondedBy: actorId })
    .where(and(eq(joinRequests.id, requestId), eq(joinRequests.status, "pending")));
}

async function requireAdminMembership(actorId: string, groupId: string) {
  const actor = await getMembership(groupId, actorId);
  if (actor?.role !== "admin") throw new Error("forbidden");
}

export async function promoteMember(actorId: string, groupId: string, memberUserId: string) {
  await requireAdminMembership(actorId, groupId);
  const target = await getMembership(groupId, memberUserId);
  if (!target) throw new Error("not-found");
  await db
    .update(member)
    .set({ role: "admin" })
    .where(and(eq(member.organizationId, groupId), eq(member.userId, memberUserId)));
}

export async function demoteMember(actorId: string, groupId: string, memberUserId: string) {
  await requireAdminMembership(actorId, groupId);
  const target = await getMembership(groupId, memberUserId);
  if (!target) throw new Error("not-found");
  if (target.role === "admin" && (await adminCount(groupId)) === 1) {
    throw new Error("last-admin");
  }
  await db
    .update(member)
    .set({ role: "member" })
    .where(and(eq(member.organizationId, groupId), eq(member.userId, memberUserId)));
}

export async function removeMember(actorId: string, groupId: string, memberUserId: string) {
  await requireAdminMembership(actorId, groupId);
  const target = await getMembership(groupId, memberUserId);
  if (!target) throw new Error("not-found");
  if (target.role === "admin" && (await adminCount(groupId)) === 1) {
    throw new Error("last-admin");
  }
  await db
    .delete(member)
    .where(and(eq(member.organizationId, groupId), eq(member.userId, memberUserId)));
}

export async function leaveGroup(actorId: string, groupId: string) {
  const actor = await getMembership(groupId, actorId);
  if (!actor) throw new Error("forbidden");
  if (actor.role === "admin" && (await adminCount(groupId)) === 1) {
    throw new Error("last-admin");
  }
  await db
    .delete(member)
    .where(and(eq(member.organizationId, groupId), eq(member.userId, actorId)));
}

export async function renameGroup(actorId: string, groupId: string, name: string) {
  await requireAdminMembership(actorId, groupId);
  await db.update(organization).set({ name }).where(eq(organization.id, groupId));
}

export async function rotateInviteCode(actorId: string, groupId: string) {
  await requireAdminMembership(actorId, groupId);
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
