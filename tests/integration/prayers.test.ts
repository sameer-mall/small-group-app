import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { approveRequest, createGroup, getInviteCode, removeMember, requestToJoin } from "@/lib/groups";
import { createMeeting } from "@/lib/meetings";
import {
  assignPrayers,
  deletePrayerRequest,
  getPrayerWall,
  joinPrayerWall,
  leavePrayerWall,
  listMyAssignedPrayers,
  postPrayerRequest,
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
    const wall = await getPrayerWall(alice, meetingId);
    expect(wall.status).toBe("open");
    expect(names(wall.notJoined)).toEqual(["Alice", "Bob", "Carol"]);
    expect(wall.requests).toEqual([]);
    expect(wall.writing).toEqual([]);
    expect(wall.viewerJoined).toBe(false);
    expect(wall.mine).toBeNull();
    expect(wall.assigned).toBeNull();

    const rows = (await db.execute(
      sql`select 1 from prayer_sessions where meeting_id = ${meetingId}`,
    )).rows;
    expect(rows).toHaveLength(0);
  });

  it("joining starts the bowl, records who started it, and moves you to waiting", async () => {
    const { meetingId } = await seedMeeting("Joining");
    await joinPrayerWall(bob, meetingId);

    const wall = await getPrayerWall(alice, meetingId);
    expect(names(wall.writing)).toEqual(["Bob"]);
    expect(names(wall.notJoined)).toEqual(["Alice", "Carol"]);

    const [session] = (await db.execute(
      sql`select started_by, status from prayer_sessions where meeting_id = ${meetingId}`,
    )).rows as { started_by: string; status: string }[];
    expect(session).toEqual({ started_by: bob, status: "open" });
  });

  it("members joining in the same instant share one bowl", async () => {
    const { meetingId } = await seedMeeting("Simultaneous");
    await Promise.all([
      joinPrayerWall(alice, meetingId),
      joinPrayerWall(bob, meetingId),
      joinPrayerWall(carol, meetingId),
    ]);

    const rows = (await db.execute(
      sql`select 1 from prayer_sessions where meeting_id = ${meetingId}`,
    )).rows;
    expect(rows).toHaveLength(1);
    expect(names((await getPrayerWall(alice, meetingId)).writing)).toEqual(["Alice", "Bob", "Carol"]);
  });

  it("writing a request joins you and moves you to submitted", async () => {
    const { meetingId } = await seedMeeting("Writing");
    await postPrayerRequest(carol, meetingId, { body: "For my sister's new job" });

    const wall = await getPrayerWall(carol, meetingId);
    expect(names(wall.requests)).toEqual(["Carol"]);
    expect(wall.viewerJoined).toBe(true);
    expect(wall.mine).toEqual({ body: "For my sister's new job" });
  });

  it("writing again edits your one request rather than adding a second", async () => {
    const { meetingId } = await seedMeeting("Editing");
    await postPrayerRequest(bob, meetingId, { body: "First draft" });
    await postPrayerRequest(bob, meetingId, { body: "Second draft" });

    const rows = (await db.execute(
      sql`select body from prayer_requests where meeting_id = ${meetingId}`,
    )).rows;
    expect(rows).toEqual([{ body: "Second draft" }]);
  });

  it("withdrawing removes your request but keeps you in the bowl, and is safe to repeat", async () => {
    const { meetingId } = await seedMeeting("Withdrawing");
    await postPrayerRequest(bob, meetingId, { body: "Never mind" });
    await deletePrayerRequest(bob, meetingId);

    const wall = await getPrayerWall(bob, meetingId);
    expect(wall.viewerJoined).toBe(true);
    expect(wall.mine).toBeNull();
    expect(names(wall.writing)).toEqual(["Bob"]);

    await deletePrayerRequest(bob, meetingId);
  });

  it("leaving takes you out of the bowl, request and all, and is safe to repeat", async () => {
    const { meetingId } = await seedMeeting("Leaving");
    await postPrayerRequest(bob, meetingId, { body: "Not this week" });
    await leavePrayerWall(bob, meetingId);

    const wall = await getPrayerWall(bob, meetingId);
    expect(wall.viewerJoined).toBe(false);
    expect(wall.mine).toBeNull();
    expect(wall.requests).toEqual([]);
    expect(names(wall.notJoined)).toEqual(["Alice", "Bob", "Carol"]);

    await leavePrayerWall(bob, meetingId);
  });

  it("every member can read another member's request on the wall", async () => {
    const { meetingId } = await seedMeeting("Open wall");
    const words = `Something Alice wrote ${crypto.randomUUID()}`;
    await postPrayerRequest(alice, meetingId, { body: words });

    const wall = await getPrayerWall(bob, meetingId);
    expect(names(wall.requests)).toEqual(["Alice"]);
    expect(wall.requests[0].body).toBe(words);
  });

  it("non-members can neither read the bowl nor write to it", async () => {
    const { meetingId } = await seedMeeting("Closed doors");
    await expect(getPrayerWall(outsider, meetingId)).rejects.toThrow("forbidden");
    await expect(joinPrayerWall(outsider, meetingId)).rejects.toThrow("forbidden");
    await expect(
      postPrayerRequest(outsider, meetingId, { body: "x" }),
    ).rejects.toThrow("forbidden");
    await expect(deletePrayerRequest(outsider, meetingId)).rejects.toThrow("forbidden");
    await expect(leavePrayerWall(outsider, meetingId)).rejects.toThrow("forbidden");
  });

  it("a meeting that does not exist is not-found", async () => {
    await expect(getPrayerWall(alice, crypto.randomUUID())).rejects.toThrow("not-found");
  });
});

describe("prayer bowl: the draw", () => {
  let alice: string, bob: string, carol: string, dave: string;
  beforeAll(async () => {
    alice = await mkUser(`u_pd_alice_${crypto.randomUUID()}`, "Alice");
    bob = await mkUser(`u_pd_bob_${crypto.randomUUID()}`, "Bob");
    carol = await mkUser(`u_pd_carol_${crypto.randomUUID()}`, "Carol");
    dave = await mkUser(`u_pd_dave_${crypto.randomUUID()}`, "Dave");
  });

  // Alice (admin) with Bob, Carol, and Dave as members, one meeting, and a
  // request from each of `writers`. Bodies are neutral ("prayer 1", …) so a
  // test can assert that no writer id appears in what a member is handed.
  async function seedBowl(name: string, writers: string[]) {
    const { groupId } = await createGroup(alice, name);
    for (const member of [bob, carol, dave]) await addMember(alice, groupId, member);
    const { meetingId } = await createMeeting(alice, groupId, { title: name, date: "2026-10-08" });
    const bodies = new Map(writers.map((writer, i) => [writer, `prayer ${i + 1}`]));
    for (const writer of writers) {
      await postPrayerRequest(writer, meetingId, { body: bodies.get(writer)! });
    }
    return { groupId, meetingId, bodyOf: (writer: string) => bodies.get(writer)! };
  }

  async function countAssignments(meetingId: string) {
    const [row] = (await db.execute(
      sql`select count(*)::int as n from prayer_assignments where meeting_id = ${meetingId}`,
    )).rows as { n: number }[];
    return row.n;
  }

  it("everyone who wrote draws exactly one request, never their own", async () => {
    const writers = [alice, bob, carol];
    const { meetingId, bodyOf } = await seedBowl("Three writers", writers);
    expect(await assignPrayers(alice, meetingId)).toEqual({ assigned: true });

    const drawn: string[] = [];
    for (const writer of writers) {
      const wall = await getPrayerWall(writer, meetingId);
      expect(wall.status).toBe("drawn");
      expect(wall.assigned!.body).not.toBe(bodyOf(writer));
      drawn.push(wall.assigned!.body);
    }
    expect(drawn.sort()).toEqual(writers.map(bodyOf).sort());
  });

  it("an assigned request always carries its writer's name, and never an id", async () => {
    const { meetingId, bodyOf } = await seedBowl("Names always", [alice, bob]);
    await assignPrayers(alice, meetingId);
    const forBob = await getPrayerWall(bob, meetingId);
    expect(forBob.assigned).toEqual({ body: bodyOf(alice), authorName: "Alice", authorImage: null });
    expect(JSON.stringify(forBob.assigned)).not.toContain(alice);
  });

  it("drawing with fewer than two requests is refused, and the bowl stays open", async () => {
    const { meetingId } = await seedBowl("Lonely", [alice]);
    await expect(assignPrayers(alice, meetingId)).rejects.toThrow("too-few-requests");

    // The refusal rolled the transition back: the bowl still takes requests.
    expect((await getPrayerWall(alice, meetingId)).status).toBe("open");
    await postPrayerRequest(bob, meetingId, { body: "a second request" });
    expect(await assignPrayers(alice, meetingId)).toEqual({ assigned: true });
  });

  it("drawing a bowl nobody has touched is refused", async () => {
    const { meetingId } = await seedBowl("Untouched draw", []);
    await expect(assignPrayers(alice, meetingId)).rejects.toThrow("too-few-requests");
  });

  it("the bowl can't be drawn while someone who's in is still writing", async () => {
    const { meetingId } = await seedBowl("Still writing", [alice, bob]);
    await joinPrayerWall(carol, meetingId);
    await expect(assignPrayers(alice, meetingId)).rejects.toThrow("still-writing");

    // The refusal rolled the transition back, so Carol can still write.
    expect((await getPrayerWall(alice, meetingId)).status).toBe("open");
    await postPrayerRequest(carol, meetingId, { body: "prayer 3" });
    expect(await assignPrayers(alice, meetingId)).toEqual({ assigned: true });
    expect(await countAssignments(meetingId)).toBe(3);
  });

  it("taking your request back out holds the draw up until you write again or leave", async () => {
    const { meetingId } = await seedBowl("Second thoughts", [alice, bob, carol]);
    await deletePrayerRequest(carol, meetingId);
    await expect(assignPrayers(alice, meetingId)).rejects.toThrow("still-writing");

    await leavePrayerWall(carol, meetingId);
    expect(await assignPrayers(alice, meetingId)).toEqual({ assigned: true });
    expect(await countAssignments(meetingId)).toBe(2);
    expect((await getPrayerWall(carol, meetingId)).assigned).toBeNull();
  });

  it("someone removed from the group while still writing doesn't hold up the draw", async () => {
    const { groupId, meetingId } = await seedBowl("Removed mid-write", [alice, bob]);
    await joinPrayerWall(carol, meetingId);
    await removeMember(alice, groupId, carol);
    expect(await assignPrayers(alice, meetingId)).toEqual({ assigned: true });
  });

  it("someone removed from the group after writing is left out of the draw", async () => {
    const { groupId, meetingId } = await seedBowl("Removed", [alice, bob, carol]);
    await removeMember(alice, groupId, carol);
    await assignPrayers(alice, meetingId);

    const assignees = (await db.execute(
      sql`select assignee_id from prayer_assignments where meeting_id = ${meetingId}`,
    )).rows as { assignee_id: string }[];
    expect(assignees.map((row) => row.assignee_id).sort()).toEqual([alice, bob].sort());
  });

  it("nothing can be joined, written, edited, or withdrawn once drawn", async () => {
    const { meetingId } = await seedBowl("Sealed shut", [alice, bob]);
    await assignPrayers(alice, meetingId);

    await expect(joinPrayerWall(carol, meetingId)).rejects.toThrow("session-closed");
    await expect(
      postPrayerRequest(carol, meetingId, { body: "late" }),
    ).rejects.toThrow("session-closed");
    await expect(
      postPrayerRequest(bob, meetingId, { body: "edited" }),
    ).rejects.toThrow("session-closed");
    await expect(deletePrayerRequest(bob, meetingId)).rejects.toThrow("session-closed");
    await expect(leavePrayerWall(bob, meetingId)).rejects.toThrow("session-closed");
  });

  it("a second draw is a no-op, not an error", async () => {
    const { meetingId } = await seedBowl("Twice", [alice, bob]);
    expect(await assignPrayers(alice, meetingId)).toEqual({ assigned: true });
    expect(await assignPrayers(bob, meetingId)).toEqual({ assigned: false });
    expect(await countAssignments(meetingId)).toBe(2);
  });

  // Writers for this test only — a dedicated helper, not seedBowl, so no
  // other test in the file gains members. Real join flow (mkUser +
  // addMember), fresh ids each run.
  async function seedStampedeBowl(count: number) {
    const { groupId } = await createGroup(alice, `Stampede ${crypto.randomUUID()}`);
    const writers: string[] = [];
    for (let i = 0; i < count; i++) {
      const writer = await mkUser(`u_pd_stampede_${i}_${crypto.randomUUID()}`, `Stampede${i}`);
      writers.push(writer);
      await addMember(alice, groupId, writer);
    }
    const { meetingId } = await createMeeting(alice, groupId, {
      title: "Stampede",
      date: "2026-10-08",
    });
    for (const writer of writers) {
      await postPrayerRequest(writer, meetingId, {
        body: `prayer from ${writer}`,
      });
    }
    return { meetingId, writers };
  }

  it("of many simultaneous draws, exactly one happens", async () => {
    // Width matters here. At 6 callers a check-then-act draw passes this
    // test 55 times in 55 — the winner's own transaction (update,
    // join-select, insert, commit) finishes before a straggler even opens
    // its own. At 15 callers / 15 writers it fails 10 of 10.
    const CALLERS = 15;
    const { meetingId, writers } = await seedStampedeBowl(CALLERS);
    // A read-then-update implementation lets several past the "still open?"
    // check; the losers then hit the unique index on assignments and
    // reject — which this test sees.
    const results = await Promise.allSettled(writers.map((who) => assignPrayers(who, meetingId)));
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    const assigned = results.map((r) => (r as PromiseFulfilledResult<{ assigned: boolean }>).value.assigned);
    expect(assigned.filter(Boolean)).toHaveLength(1);
    expect(await countAssignments(meetingId)).toBe(CALLERS);
  });

  it("a request written during a draw is either drawn or refused — never stranded", async () => {
    // Each round races one draw against two late writers. Whatever the
    // interleaving, every request in a drawn bowl must have been drawn.
    for (let round = 0; round < 15; round++) {
      const { meetingId } = await seedBowl(`Race ${round}`, [alice, bob]);
      const [, carolResult, daveResult] = await Promise.allSettled([
        assignPrayers(alice, meetingId),
        postPrayerRequest(carol, meetingId, { body: "late from Carol" }),
        postPrayerRequest(dave, meetingId, { body: "late from Dave" }),
      ]);
      for (const result of [carolResult, daveResult]) {
        if (result.status === "rejected") {
          expect((result.reason as Error).message).toBe("session-closed");
        }
      }
      const [counts] = (await db.execute(sql`
        select
          (select count(*)::int from prayer_requests where meeting_id = ${meetingId}) as requests,
          (select count(*)::int from prayer_assignments where meeting_id = ${meetingId}) as assigned
      `)).rows as { requests: number; assigned: number }[];
      expect(counts.assigned).toBe(counts.requests);
    }
  });

  it("a join during a draw either holds the draw up or is refused, never left waiting", async () => {
    // Each round races one draw against a late join. Exactly one of them can
    // win: a drawn bowl with someone still in Waiting on is what this rule
    // exists to prevent. The order alternates because whichever call starts
    // first nearly always takes the bowl's lock first; started first every
    // time, the draw won all 15 rounds even with no still-writing check.
    for (let round = 0; round < 16; round++) {
      const { meetingId } = await seedBowl(`Join race ${round}`, [alice, bob]);
      const draw = () => assignPrayers(alice, meetingId);
      const join = () => joinPrayerWall(carol, meetingId);
      const [drawResult, joinResult] =
        round % 2 === 0
          ? await Promise.allSettled([draw(), join()])
          : await Promise.allSettled([join(), draw()]).then(([j, d]) => [d, j] as const);
      if (drawResult.status === "fulfilled") {
        expect(joinResult.status).toBe("rejected");
        expect((joinResult as PromiseRejectedResult).reason.message).toBe("session-closed");
      } else {
        expect(drawResult.reason.message).toBe("still-writing");
        expect(joinResult.status).toBe("fulfilled");
      }
    }
  });
});

describe("my prayers", () => {
  let alice: string, bob: string, outsider: string;
  beforeAll(async () => {
    alice = await mkUser(`u_pm_alice_${crypto.randomUUID()}`, "Alice");
    bob = await mkUser(`u_pm_bob_${crypto.randomUUID()}`, "Bob");
    outsider = await mkUser(`u_pm_out_${crypto.randomUUID()}`, "Outsider");
  });

  // Two writers always swap, so who draws what is known in advance.
  async function drawnMeeting(groupId: string, title: string, date: string) {
    const { meetingId } = await createMeeting(alice, groupId, { title, date });
    await postPrayerRequest(alice, meetingId, { body: `Alice, ${title}` });
    await postPrayerRequest(bob, meetingId, { body: `Bob, ${title}` });
    await assignPrayers(alice, meetingId);
    return meetingId;
  }

  it("lists what you drew, newest meeting first, with its meeting", async () => {
    const { groupId } = await createGroup(alice, "Week by week");
    await addMember(alice, groupId, bob);
    await drawnMeeting(groupId, "Week 1", "2026-10-01");
    await drawnMeeting(groupId, "Week 2", "2026-10-08");

    expect(await listMyAssignedPrayers(alice, groupId)).toEqual([
      expect.objectContaining({ meetingTitle: "Week 2", meetingDate: "2026-10-08", body: "Bob, Week 2", authorName: "Bob" }),
      expect.objectContaining({ meetingTitle: "Week 1", meetingDate: "2026-10-01", body: "Bob, Week 1", authorName: "Bob" }),
    ]);
  });

  it("lists only your own draws, from this group only", async () => {
    const { groupId } = await createGroup(alice, "Mine only");
    await addMember(alice, groupId, bob);
    await drawnMeeting(groupId, "Here", "2026-10-01");

    const { groupId: elsewhere } = await createGroup(alice, "Elsewhere");
    await addMember(alice, elsewhere, bob);
    await drawnMeeting(elsewhere, "There", "2026-10-01");

    const bodies = (await listMyAssignedPrayers(alice, groupId)).map((p) => p.body);
    expect(bodies).toEqual(["Bob, Here"]);
  });

  it("is empty before any draw, and refuses non-members", async () => {
    const { groupId } = await createGroup(alice, "Nothing yet");
    expect(await listMyAssignedPrayers(alice, groupId)).toEqual([]);
    await expect(listMyAssignedPrayers(outsider, groupId)).rejects.toThrow("forbidden");
  });

  it("drops a request once its author leaves the group", async () => {
    const { groupId } = await createGroup(alice, "Author left");
    await addMember(alice, groupId, bob);
    await drawnMeeting(groupId, "Week 1", "2026-10-01");
    expect(await listMyAssignedPrayers(alice, groupId)).toHaveLength(1);
    await removeMember(alice, groupId, bob);
    expect(await listMyAssignedPrayers(alice, groupId)).toEqual([]);
  });

  it("breaks ties on the same meeting date by createdAt, newer meeting first", async () => {
    const { groupId } = await createGroup(alice, "Same day");
    await addMember(alice, groupId, bob);
    await drawnMeeting(groupId, "Morning", "2026-10-01");
    await drawnMeeting(groupId, "Evening", "2026-10-01");

    const titles = (await listMyAssignedPrayers(alice, groupId)).map((p) => p.meetingTitle);
    expect(titles).toEqual(["Evening", "Morning"]);
  });
});

describe("prayer wall: what members read", () => {
  let alice: string, bob: string, carol: string, outsider: string;
  beforeAll(async () => {
    alice = await mkUser(`u_w_alice_${crypto.randomUUID()}`, "Alice");
    bob = await mkUser(`u_w_bob_${crypto.randomUUID()}`, "Bob");
    carol = await mkUser(`u_w_carol_${crypto.randomUUID()}`, "Carol");
    outsider = await mkUser(`u_w_out_${crypto.randomUUID()}`, "Outsider");
  });

  async function seedMeeting(name: string) {
    const { groupId } = await createGroup(alice, name);
    await addMember(alice, groupId, bob);
    await addMember(alice, groupId, carol);
    const { meetingId } = await createMeeting(alice, groupId, { title: name, date: "2026-11-26" });
    return { groupId, meetingId };
  }

  it("every member reads every request, newest first, with names", async () => {
    const { meetingId } = await seedMeeting("Wall read");
    await postPrayerRequest(alice, meetingId, { body: "A" });
    await postPrayerRequest(bob, meetingId, { body: "B" });
    const wall = await getPrayerWall(carol, meetingId);
    expect(wall.requests.map((r) => [r.name, r.body, r.isMine])).toEqual([
      ["Bob", "B", false],
      ["Alice", "A", false],
    ]);
    expect(wall.mine).toBeNull();
  });

  it("splits members into writing and not joined, and marks the viewer's own request", async () => {
    const { meetingId } = await seedMeeting("Wall buckets");
    await postPrayerRequest(alice, meetingId, { body: "A" });
    await joinPrayerWall(bob, meetingId);
    const wall = await getPrayerWall(alice, meetingId);
    expect(names(wall.writing)).toEqual(["Bob"]);
    expect(names(wall.notJoined)).toEqual(["Carol"]);
    expect(wall.viewerJoined).toBe(true);
    expect(wall.mine).toEqual({ body: "A" });
    expect(wall.requests[0].isMine).toBe(true);
  });

  it("a removed member's request leaves the wall", async () => {
    const { groupId, meetingId } = await seedMeeting("Wall removed");
    await postPrayerRequest(bob, meetingId, { body: "B" });
    await removeMember(alice, groupId, bob);
    const wall = await getPrayerWall(alice, meetingId);
    expect(wall.requests).toEqual([]);
  });

  it("after assigning, the viewer sees their own assignment and nobody else's", async () => {
    const { meetingId } = await seedMeeting("Wall assigned");
    await postPrayerRequest(alice, meetingId, { body: "A" });
    await postPrayerRequest(bob, meetingId, { body: "B" });
    await assignPrayers(alice, meetingId);
    const wall = await getPrayerWall(alice, meetingId);
    expect(wall.status).toBe("drawn");
    expect(wall.assigned).toEqual({ body: "B", authorName: "Bob", authorImage: null });
    expect(wall.myRequestIsAssigned).toBe(true);
    // Bob is Alice's assignee; that pairing must not reach Alice.
    const assigneeRows = (await db.execute(
      sql`select assignee_id from prayer_assignments where meeting_id = ${meetingId}`,
    )).rows as { assignee_id: string }[];
    expect(assigneeRows).toHaveLength(2);
    expect(JSON.stringify({ ...wall, requests: wall.requests.map(({ authorId: _, ...r }) => r) })).not.toContain(bob);
    const carolWall = await getPrayerWall(carol, meetingId);
    expect(carolWall.assigned).toBeNull();
    expect(carolWall.myRequestIsAssigned).toBe(false);
  });

  it("an assigned request disappears once its author leaves the group", async () => {
    const { groupId, meetingId } = await seedMeeting("Wall assigned removed");
    await postPrayerRequest(alice, meetingId, { body: "A" });
    await postPrayerRequest(bob, meetingId, { body: "B" });
    await assignPrayers(alice, meetingId);
    expect((await getPrayerWall(alice, meetingId)).assigned).not.toBeNull();
    await removeMember(alice, groupId, bob);
    expect((await getPrayerWall(alice, meetingId)).assigned).toBeNull();
  });

  it("non-members cannot read the wall", async () => {
    const { meetingId } = await seedMeeting("Wall outsider");
    await expect(getPrayerWall(outsider, meetingId)).rejects.toThrow("forbidden");
  });
});
