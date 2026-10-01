import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { approveRequest, createGroup, getInviteCode, requestToJoin } from "@/lib/groups";
import { createMeeting } from "@/lib/meetings";
import {
  getPrayerBowl,
  joinPrayerBowl,
  submitPrayerRequest,
  withdrawPrayerRequest,
} from "@/lib/prayers";

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

const names = (list: { name: string }[]) => list.map((m) => m.name);

describe("prayer bowl: presence and requests", () => {
  let alice: string, bob: string, carol: string, outsider: string;
  beforeAll(async () => {
    alice = await mkUser(`u_p_alice_${crypto.randomUUID()}`, "Alice");
    bob = await mkUser(`u_p_bob_${crypto.randomUUID()}`, "Bob");
    carol = await mkUser(`u_p_carol_${crypto.randomUUID()}`, "Carol");
    outsider = await mkUser(`u_p_out_${crypto.randomUUID()}`, "Outsider");
  });

  // Alice (admin), Bob and Carol (members), and one meeting.
  async function seedMeeting(name: string) {
    const { groupId } = await createGroup(alice, name);
    await addMember(alice, groupId, bob);
    await addMember(alice, groupId, carol);
    const { meetingId } = await createMeeting(alice, groupId, { title: name, date: "2026-10-08" });
    return { groupId, meetingId };
  }

  it("a meeting's bowl reads as open with nobody in, and reading it writes nothing", async () => {
    const { meetingId } = await seedMeeting("Untouched");
    const bowl = await getPrayerBowl(alice, meetingId);
    expect(bowl.status).toBe("open");
    expect(names(bowl.notJoined)).toEqual(["Alice", "Bob", "Carol"]);
    expect(bowl.submitted).toEqual([]);
    expect(bowl.waiting).toEqual([]);
    expect(bowl.viewer).toEqual({ joined: false, request: null });
    expect(bowl.drawn).toBeNull();

    const rows = (await db.execute(
      sql`select 1 from prayer_sessions where meeting_id = ${meetingId}`,
    )).rows;
    expect(rows).toHaveLength(0);
  });

  it("joining starts the bowl, records who started it, and moves you to waiting", async () => {
    const { meetingId } = await seedMeeting("Joining");
    await joinPrayerBowl(bob, meetingId);

    const bowl = await getPrayerBowl(alice, meetingId);
    expect(names(bowl.waiting)).toEqual(["Bob"]);
    expect(names(bowl.notJoined)).toEqual(["Alice", "Carol"]);

    const [session] = (await db.execute(
      sql`select started_by, status from prayer_sessions where meeting_id = ${meetingId}`,
    )).rows as { started_by: string; status: string }[];
    expect(session).toEqual({ started_by: bob, status: "open" });
  });

  it("members joining in the same instant share one bowl", async () => {
    const { meetingId } = await seedMeeting("Simultaneous");
    await Promise.all([
      joinPrayerBowl(alice, meetingId),
      joinPrayerBowl(bob, meetingId),
      joinPrayerBowl(carol, meetingId),
    ]);

    const rows = (await db.execute(
      sql`select 1 from prayer_sessions where meeting_id = ${meetingId}`,
    )).rows;
    expect(rows).toHaveLength(1);
    expect(names((await getPrayerBowl(alice, meetingId)).waiting)).toEqual(["Alice", "Bob", "Carol"]);
  });

  it("writing a request joins you and moves you to submitted", async () => {
    const { meetingId } = await seedMeeting("Writing");
    await submitPrayerRequest(carol, meetingId, { body: "For my sister's new job", includeName: false });

    const bowl = await getPrayerBowl(carol, meetingId);
    expect(names(bowl.submitted)).toEqual(["Carol"]);
    expect(bowl.viewer).toEqual({
      joined: true,
      request: { body: "For my sister's new job", includeName: false },
    });
  });

  it("writing again edits your one request rather than adding a second", async () => {
    const { meetingId } = await seedMeeting("Editing");
    await submitPrayerRequest(bob, meetingId, { body: "First draft", includeName: false });
    await submitPrayerRequest(bob, meetingId, { body: "Second draft", includeName: true });

    const rows = (await db.execute(
      sql`select body, include_name from prayer_requests where meeting_id = ${meetingId}`,
    )).rows;
    expect(rows).toEqual([{ body: "Second draft", include_name: true }]);
  });

  it("withdrawing removes your request but keeps you in the bowl, and is safe to repeat", async () => {
    const { meetingId } = await seedMeeting("Withdrawing");
    await submitPrayerRequest(bob, meetingId, { body: "Never mind", includeName: false });
    await withdrawPrayerRequest(bob, meetingId);

    const bowl = await getPrayerBowl(bob, meetingId);
    expect(bowl.viewer).toEqual({ joined: true, request: null });
    expect(names(bowl.waiting)).toEqual(["Bob"]);

    await withdrawPrayerRequest(bob, meetingId);
  });

  it("no member can read another member's request before the draw", async () => {
    const { meetingId } = await seedMeeting("Sealed");
    const secret = `Something only Alice wrote ${crypto.randomUUID()}`;
    await submitPrayerRequest(alice, meetingId, { body: secret, includeName: true });

    // Bob may see *that* Alice wrote — names are public — but never her words.
    const bowl = await getPrayerBowl(bob, meetingId);
    expect(names(bowl.submitted)).toEqual(["Alice"]);
    expect(JSON.stringify(bowl)).not.toContain(secret);
  });

  it("non-members can neither read the bowl nor write to it", async () => {
    const { meetingId } = await seedMeeting("Closed doors");
    await expect(getPrayerBowl(outsider, meetingId)).rejects.toThrow("forbidden");
    await expect(joinPrayerBowl(outsider, meetingId)).rejects.toThrow("forbidden");
    await expect(
      submitPrayerRequest(outsider, meetingId, { body: "x", includeName: false }),
    ).rejects.toThrow("forbidden");
    await expect(withdrawPrayerRequest(outsider, meetingId)).rejects.toThrow("forbidden");
  });

  it("a meeting that does not exist is not-found", async () => {
    await expect(getPrayerBowl(alice, crypto.randomUUID())).rejects.toThrow("not-found");
  });
});
