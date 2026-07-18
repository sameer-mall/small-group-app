import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  adminCount, approveRequest, createGroup, demoteMember, getInviteCode,
  getMembership, leaveGroup, promoteMember, removeMember, requestToJoin,
  rotateInviteCode,
} from "@/lib/groups";

async function mkUser(id: string) {
  // Deviation from brief: real generated columns are snake_case
  // (email_verified/created_at/updated_at), not camelCase-quoted — same fact
  // already documented in tests/integration/group-tables.test.ts (Task 4).
  await db.execute(sql`insert into "user" (id, name, email, email_verified, created_at, updated_at)
    values (${id}, ${id}, ${id + "@example.com"}, true, now(), now()) on conflict do nothing`);
  return id;
}

describe("groups domain", () => {
  let alice: string, bob: string, cara: string;
  beforeAll(async () => {
    [alice, bob, cara] = await Promise.all([mkUser("u_alice"), mkUser("u_bob"), mkUser("u_cara")]);
  });

  it("creator becomes admin and gets an invite code", async () => {
    const { groupId } = await createGroup(alice, "Tuesday group");
    expect((await getMembership(groupId, alice))?.role).toBe("admin");
    expect(await getInviteCode(groupId)).toHaveLength(10);
  });

  it("join flow: request → approve → member", async () => {
    const { groupId } = await createGroup(alice, "Joinable");
    const code = await getInviteCode(groupId);
    const req = await requestToJoin(bob, code);
    expect(req.groupId).toBe(groupId);
    expect(await getMembership(groupId, bob)).toBeNull();
    const [pending] = (await db.execute(
      sql`select id from join_requests where group_id = ${groupId} and user_id = ${bob} and status = 'pending'`,
    )).rows as { id: string }[];
    await approveRequest(alice, pending.id);
    expect((await getMembership(groupId, bob))?.role).toBe("member");
  });

  it("non-admin cannot approve", async () => {
    const { groupId } = await createGroup(alice, "Sealed");
    const code = await getInviteCode(groupId);
    await requestToJoin(bob, code);
    const [pending] = (await db.execute(
      sql`select id from join_requests where group_id = ${groupId} and user_id = ${bob}`,
    )).rows as { id: string }[];
    await expect(approveRequest(cara, pending.id)).rejects.toThrow("forbidden");
  });

  it("rotating the code invalidates the old one for new joiners only", async () => {
    const { groupId } = await createGroup(alice, "Rotating");
    const oldCode = await getInviteCode(groupId);
    await rotateInviteCode(alice, groupId);
    await expect(requestToJoin(bob, oldCode)).rejects.toThrow("not-found");
    await expect(requestToJoin(bob, await getInviteCode(groupId))).resolves.toBeTruthy();
  });

  it("last admin cannot demote, leave, or be removed", async () => {
    const { groupId } = await createGroup(alice, "Fragile");
    await expect(demoteMember(alice, groupId, alice)).rejects.toThrow("last-admin");
    await expect(leaveGroup(alice, groupId)).rejects.toThrow("last-admin");
    await expect(removeMember(alice, groupId, alice)).rejects.toThrow("last-admin");
    const code = await getInviteCode(groupId);
    await requestToJoin(bob, code);
    const [p] = (await db.execute(
      sql`select id from join_requests where group_id = ${groupId} and user_id = ${bob}`,
    )).rows as { id: string }[];
    await approveRequest(alice, p.id);
    await promoteMember(alice, groupId, bob);
    expect(await adminCount(groupId)).toBe(2);
    await expect(leaveGroup(alice, groupId)).resolves.toBeUndefined();
  });
});
