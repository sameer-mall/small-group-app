import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { createGroup, getInviteCode, requestToJoin, approveRequest } from "@/lib/groups";
import {
  createMeeting, deleteMeeting, getMeeting, listMeetings, updateMeeting,
} from "@/lib/meetings";

async function mkUser(id: string, name = id) {
  await db.execute(sql`insert into "user" (id, name, email, email_verified, created_at, updated_at)
    values (${id}, ${name}, ${id + "@example.com"}, true, now(), now()) on conflict do nothing`);
  return id;
}

// Adds `userId` to `groupId` as a plain member via the real join flow.
async function addMember(adminId: string, groupId: string, userId: string) {
  await requestToJoin(userId, await getInviteCode(groupId));
  const [req] = (await db.execute(
    sql`select id from join_requests where group_id = ${groupId} and user_id = ${userId} and status = 'pending'`,
  )).rows as { id: string }[];
  await approveRequest(adminId, req.id);
}

describe("meetings domain", () => {
  let alice: string, bob: string, carol: string;
  beforeAll(async () => {
    alice = await mkUser(`u_m_alice_${crypto.randomUUID()}`, "Alice");
    bob = await mkUser(`u_m_bob_${crypto.randomUUID()}`, "Bob");
    carol = await mkUser(`u_m_carol_${crypto.randomUUID()}`, "Carol");
  });

  it("a member can create a meeting; a non-member cannot", async () => {
    const { groupId } = await createGroup(alice, "Meeting makers");
    const { meetingId } = await createMeeting(alice, groupId, {
      title: "Week 12 — Romans 8",
      date: "2026-09-10",
    });
    const meeting = await getMeeting(meetingId);
    expect(meeting).toMatchObject({
      groupId, title: "Week 12 — Romans 8", date: "2026-09-10", createdBy: alice,
    });

    await expect(
      createMeeting(carol, groupId, { title: "Sneaky", date: "2026-09-11" }),
    ).rejects.toThrow("forbidden");
  });

  it("lists a group's meetings in date order", async () => {
    const { groupId } = await createGroup(alice, "Ordering");
    await createMeeting(alice, groupId, { title: "Third", date: "2026-03-01" });
    await createMeeting(alice, groupId, { title: "First", date: "2026-01-01" });
    await createMeeting(alice, groupId, { title: "Second", date: "2026-02-01" });

    const titles = (await listMeetings(groupId)).map((m) => m.title);
    expect(titles).toEqual(["First", "Second", "Third"]);
  });

  it("the creator or an admin can edit and delete; another member cannot", async () => {
    const { groupId } = await createGroup(alice, "Permissions");
    await addMember(alice, groupId, bob);
    await addMember(alice, groupId, carol);

    // Bob (a plain member) creates it, so he is the creator.
    const { meetingId } = await createMeeting(bob, groupId, { title: "Bob's night", date: "2026-09-17" });

    // Carol is a member but neither creator nor admin.
    await expect(
      updateMeeting(carol, meetingId, { title: "Hijacked", date: "2026-09-17" }),
    ).rejects.toThrow("forbidden");
    await expect(deleteMeeting(carol, meetingId)).rejects.toThrow("forbidden");

    // The creator can edit.
    await updateMeeting(bob, meetingId, { title: "Bob's night (moved)", date: "2026-09-18" });
    expect(await getMeeting(meetingId)).toMatchObject({
      title: "Bob's night (moved)", date: "2026-09-18",
    });

    // An admin can delete someone else's meeting.
    await deleteMeeting(alice, meetingId);
    expect(await getMeeting(meetingId)).toBeNull();
  });

  it("throws not-found for a meeting that does not exist", async () => {
    await expect(
      updateMeeting(alice, crypto.randomUUID(), { title: "Ghost", date: "2026-09-01" }),
    ).rejects.toThrow("not-found");
  });
});
