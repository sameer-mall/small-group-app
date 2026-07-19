import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  adminCount, approveRequest, createGroup, demoteMember, getGroupByInviteCode,
  getInviteCode, getMembership, leaveGroup, listPendingRequestsForUser,
  promoteMember, removeMember, requestToJoin, rotateInviteCode,
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

  it("approving the same request twice throws not-found on the second call and does not duplicate the member row", async () => {
    const { groupId } = await createGroup(alice, "Double approve");
    const code = await getInviteCode(groupId);
    await requestToJoin(bob, code);
    const [pending] = (await db.execute(
      sql`select id from join_requests where group_id = ${groupId} and user_id = ${bob} and status = 'pending'`,
    )).rows as { id: string }[];

    await approveRequest(alice, pending.id);
    expect((await getMembership(groupId, bob))?.role).toBe("member");

    // Second approval of the same (now-approved) request must not re-insert
    // a member row — the update matches zero pending rows, so it's not-found.
    await expect(approveRequest(alice, pending.id)).rejects.toThrow("not-found");

    const memberRows = (
      await db.execute(
        sql`select id from member where organization_id = ${groupId} and user_id = ${bob}`,
      )
    ).rows;
    expect(memberRows).toHaveLength(1);
  });

  it("a user who is already a member cannot request to join again", async () => {
    const { groupId } = await createGroup(alice, "No re-request");
    const code = await getInviteCode(groupId);
    await requestToJoin(bob, code);
    const [pending] = (await db.execute(
      sql`select id from join_requests where group_id = ${groupId} and user_id = ${bob} and status = 'pending'`,
    )).rows as { id: string }[];
    await approveRequest(alice, pending.id);
    expect((await getMembership(groupId, bob))?.role).toBe("member");

    await expect(requestToJoin(bob, code)).rejects.toThrow("already-member");
  });

  it("getGroupByInviteCode resolves a live code without creating a request, and returns null for a dead one", async () => {
    const { groupId } = await createGroup(alice, "Read-only lookup");
    const code = await getInviteCode(groupId);

    const found = await getGroupByInviteCode(code);
    expect(found).toEqual({ groupId, name: "Read-only lookup" });

    // Read-only: no join_requests row should have been created as a side effect.
    const rows = (
      await db.execute(sql`select id from join_requests where group_id = ${groupId} and user_id = ${bob}`)
    ).rows;
    expect(rows).toHaveLength(0);

    expect(await getGroupByInviteCode("not-a-real-code")).toBeNull();
  });

  it("listPendingRequestsForUser lists only pending requests, joined to group names", async () => {
    // A fresh user id per run — this suite runs against a persistent local
    // Postgres, so a fixed id would accumulate pending rows across runs.
    const dan = await mkUser(`u_dan_${crypto.randomUUID()}`);
    const groupA = await createGroup(alice, "Pending A");
    const groupB = await createGroup(alice, "Pending B");
    const groupC = await createGroup(alice, "Approved C");

    await requestToJoin(dan, await getInviteCode(groupA.groupId));
    await requestToJoin(dan, await getInviteCode(groupB.groupId));
    await requestToJoin(dan, await getInviteCode(groupC.groupId));
    const [approvedReq] = (await db.execute(
      sql`select id from join_requests where group_id = ${groupC.groupId} and user_id = ${dan}`,
    )).rows as { id: string }[];
    await approveRequest(alice, approvedReq.id);

    const pending = await listPendingRequestsForUser(dan);
    expect(pending).toHaveLength(2);
    expect(pending.map((r) => r.groupName).sort()).toEqual(["Pending A", "Pending B"]);
    expect(pending.every((r) => r.groupId === groupA.groupId || r.groupId === groupB.groupId)).toBe(true);
  });
});
