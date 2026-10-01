import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { approveRequest, createGroup, getInviteCode, removeMember, requestToJoin } from "@/lib/groups";
import { createMeeting } from "@/lib/meetings";
import {
  drawPrayerBowl,
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
  // test can assert that an unsigned writer's name and id appear nowhere.
  async function seedBowl(name: string, writers: string[], signed: string[] = []) {
    const { groupId } = await createGroup(alice, name);
    for (const member of [bob, carol, dave]) await addMember(alice, groupId, member);
    const { meetingId } = await createMeeting(alice, groupId, { title: name, date: "2026-10-08" });
    const bodies = new Map(writers.map((writer, i) => [writer, `prayer ${i + 1}`]));
    for (const writer of writers) {
      await submitPrayerRequest(writer, meetingId, {
        body: bodies.get(writer)!,
        includeName: signed.includes(writer),
      });
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
    expect(await drawPrayerBowl(alice, meetingId)).toEqual({ drew: true });

    const drawn: string[] = [];
    for (const writer of writers) {
      const bowl = await getPrayerBowl(writer, meetingId);
      expect(bowl.status).toBe("drawn");
      expect(bowl.drawn!.body).not.toBe(bodyOf(writer));
      drawn.push(bowl.drawn!.body);
    }
    expect(drawn.sort()).toEqual(writers.map(bodyOf).sort());
  });

  it("an unsigned request reaches its drawer without the writer's name or id", async () => {
    // Two writers always swap: Alice draws Bob's, Bob draws Alice's.
    const { meetingId, bodyOf } = await seedBowl("Signing", [alice, bob], [alice]);
    await drawPrayerBowl(bob, meetingId);

    const aliceView = await getPrayerBowl(alice, meetingId);
    // toEqual also fails on any extra key, so an authorId tagging along fails here.
    expect(aliceView.drawn).toEqual({ body: bodyOf(bob), authorName: null });
    expect(JSON.stringify(aliceView.drawn)).not.toContain(bob);
    expect(JSON.stringify(aliceView.drawn)).not.toContain("Bob");

    const bobView = await getPrayerBowl(bob, meetingId);
    expect(bobView.drawn).toEqual({ body: bodyOf(alice), authorName: "Alice" });
  });

  it("drawing with fewer than two requests is refused, and the bowl stays open", async () => {
    const { meetingId } = await seedBowl("Lonely", [alice]);
    await expect(drawPrayerBowl(alice, meetingId)).rejects.toThrow("too-few-requests");

    // The refusal rolled the transition back: the bowl still takes requests.
    expect((await getPrayerBowl(alice, meetingId)).status).toBe("open");
    await submitPrayerRequest(bob, meetingId, { body: "a second request", includeName: false });
    expect(await drawPrayerBowl(alice, meetingId)).toEqual({ drew: true });
  });

  it("drawing a bowl nobody has touched is refused", async () => {
    const { meetingId } = await seedBowl("Untouched draw", []);
    await expect(drawPrayerBowl(alice, meetingId)).rejects.toThrow("too-few-requests");
  });

  it("people who joined but never wrote are left out of the draw", async () => {
    const { meetingId } = await seedBowl("Quiet one", [alice, bob]);
    await joinPrayerBowl(carol, meetingId);
    await drawPrayerBowl(alice, meetingId);

    expect(await countAssignments(meetingId)).toBe(2);
    expect((await getPrayerBowl(carol, meetingId)).drawn).toBeNull();
  });

  it("someone removed from the group after writing is left out of the draw", async () => {
    const { groupId, meetingId } = await seedBowl("Removed", [alice, bob, carol]);
    await removeMember(alice, groupId, carol);
    await drawPrayerBowl(alice, meetingId);

    const assignees = (await db.execute(
      sql`select assignee_id from prayer_assignments where meeting_id = ${meetingId}`,
    )).rows as { assignee_id: string }[];
    expect(assignees.map((row) => row.assignee_id).sort()).toEqual([alice, bob].sort());
  });

  it("nothing can be joined, written, edited, or withdrawn once drawn", async () => {
    const { meetingId } = await seedBowl("Sealed shut", [alice, bob]);
    await drawPrayerBowl(alice, meetingId);

    await expect(joinPrayerBowl(carol, meetingId)).rejects.toThrow("session-closed");
    await expect(
      submitPrayerRequest(carol, meetingId, { body: "late", includeName: false }),
    ).rejects.toThrow("session-closed");
    await expect(
      submitPrayerRequest(bob, meetingId, { body: "edited", includeName: false }),
    ).rejects.toThrow("session-closed");
    await expect(withdrawPrayerRequest(bob, meetingId)).rejects.toThrow("session-closed");
  });

  it("a second draw is a no-op, not an error", async () => {
    const { meetingId } = await seedBowl("Twice", [alice, bob]);
    expect(await drawPrayerBowl(alice, meetingId)).toEqual({ drew: true });
    expect(await drawPrayerBowl(bob, meetingId)).toEqual({ drew: false });
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
      await submitPrayerRequest(writer, meetingId, {
        body: `prayer from ${writer}`,
        includeName: false,
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
    const results = await Promise.allSettled(writers.map((who) => drawPrayerBowl(who, meetingId)));
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    const drew = results.map((r) => (r as PromiseFulfilledResult<{ drew: boolean }>).value.drew);
    expect(drew.filter(Boolean)).toHaveLength(1);
    expect(await countAssignments(meetingId)).toBe(CALLERS);
  });

  it("a request written during a draw is either drawn or refused — never stranded", async () => {
    // Each round races one draw against two late writers. Whatever the
    // interleaving, every request in a drawn bowl must have been drawn.
    for (let round = 0; round < 15; round++) {
      const { meetingId } = await seedBowl(`Race ${round}`, [alice, bob]);
      const [, carolResult, daveResult] = await Promise.allSettled([
        drawPrayerBowl(alice, meetingId),
        submitPrayerRequest(carol, meetingId, { body: "late from Carol", includeName: false }),
        submitPrayerRequest(dave, meetingId, { body: "late from Dave", includeName: false }),
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
});
