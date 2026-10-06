import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { member, user } from "@/db/auth-schema";
import {
  meetings,
  prayerAssignments,
  prayerParticipants,
  prayerRequests,
  prayerSessions,
} from "@/db/schema";
import { derangement } from "@/lib/derangement";
import { listMembers } from "@/lib/groups";
import { requireMembership } from "@/lib/membership";

export type BowlMember = { userId: string; name: string };

export type PrayerBowl = {
  meetingId: string;
  status: "open" | "drawn";
  // Names only — who is in, never what they wrote.
  submitted: BowlMember[];
  waiting: BowlMember[];
  notJoined: BowlMember[];
  viewer: {
    joined: boolean;
    // The viewer's own request, so they can edit it. Nobody else's, ever.
    request: { body: string; includeName: boolean } | null;
  };
  // After the draw, the one request the viewer drew (Task 3).
  drawn: { body: string; authorName: string | null } | null;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Loads the meeting and confirms the actor belongs to its group. Every entry
// point starts from a meeting id the client supplied, so the group is read
// back off the row rather than trusted from the caller.
async function requireMeetingMember(userId: string, meetingId: string) {
  const [meeting] = await db
    .select({ id: meetings.id, groupId: meetings.groupId })
    .from(meetings)
    .where(eq(meetings.id, meetingId));
  if (!meeting) throw new Error("not-found");
  await requireMembership(userId, meeting.groupId);
  return meeting;
}

// The bowl starts itself: no row exists until the first member joins or
// writes, and that member is recorded as having started it. ON CONFLICT DO
// NOTHING makes members acting in the same instant land in one bowl rather
// than racing to create two.
async function ensureBowl(tx: Tx, meetingId: string, userId: string) {
  await tx.insert(prayerSessions).values({ meetingId, startedBy: userId }).onConflictDoNothing();
}

async function ensureParticipant(tx: Tx, meetingId: string, userId: string) {
  await tx.insert(prayerParticipants).values({ meetingId, userId }).onConflictDoNothing();
}

// A cryptographically random source for the draw, rather than Math.random —
// the assignment decides who reads whose private words, so it should not
// rest on a PRNG that is predictable from its outputs.
function cryptoRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}

// Locks the bowl's row until this transaction ends and confirms it is still
// open. FOR SHARE conflicts with the draw's UPDATE, so a write and a draw can
// never interleave: either the write commits first and the draw includes it,
// or the draw commits first and the write is refused. Without the lock, a
// request can land after the draw has read the requests and before it
// commits — stranded, in a drawn bowl, assigned to nobody.
//
// It must be FOR SHARE, not the weaker FOR KEY SHARE. An UPDATE that touches
// no key column (status, drawn_by, drawn_at) takes FOR NO KEY UPDATE, which
// does not conflict with FOR KEY SHARE — the very lock the foreign-key checks
// on these inserts already take. That is why the FK checks alone don't keep
// a write out of a draw, and why this explicit lock exists.
async function lockOpenBowl(tx: Tx, meetingId: string) {
  const [bowl] = await tx
    .select({ status: prayerSessions.status })
    .from(prayerSessions)
    .where(eq(prayerSessions.meetingId, meetingId))
    .for("share");
  if (bowl?.status === "drawn") throw new Error("session-closed");
}

export async function joinPrayerBowl(userId: string, meetingId: string): Promise<void> {
  await requireMeetingMember(userId, meetingId);
  await db.transaction(async (tx) => {
    await ensureBowl(tx, meetingId, userId);
    await lockOpenBowl(tx, meetingId);
    await ensureParticipant(tx, meetingId, userId);
  });
}

// One request per person per bowl, so writing again edits it. Writing also
// joins you — putting a request in is the clearest possible "I'm in".
export async function submitPrayerRequest(
  userId: string,
  meetingId: string,
  input: { body: string; includeName: boolean },
): Promise<void> {
  await requireMeetingMember(userId, meetingId);
  await db.transaction(async (tx) => {
    await ensureBowl(tx, meetingId, userId);
    await lockOpenBowl(tx, meetingId);
    await ensureParticipant(tx, meetingId, userId);
    await tx
      .insert(prayerRequests)
      .values({ meetingId, authorId: userId, body: input.body, includeName: input.includeName })
      .onConflictDoUpdate({
        target: [prayerRequests.meetingId, prayerRequests.authorId],
        set: { body: input.body, includeName: input.includeName, updatedAt: new Date() },
      });
  });
}

// Takes your request back out. You stay in the bowl — you're just not holding
// a request any more — and doing it twice is harmless.
export async function withdrawPrayerRequest(userId: string, meetingId: string): Promise<void> {
  await requireMeetingMember(userId, meetingId);
  await db.transaction(async (tx) => {
    // No bowl means nothing to withdraw; lockOpenBowl lets that through.
    await lockOpenBowl(tx, meetingId);
    await tx
      .delete(prayerRequests)
      .where(and(eq(prayerRequests.meetingId, meetingId), eq(prayerRequests.authorId, userId)));
  });
}

// Takes you out of the bowl, and your request with you if you wrote one.
// Since the bowl can't be drawn while anyone who's in is still writing, this
// is how someone who tapped "I'm in" and changed their mind stops holding
// everyone else up. Doing it twice is harmless.
export async function leavePrayerBowl(userId: string, meetingId: string): Promise<void> {
  await requireMeetingMember(userId, meetingId);
  await db.transaction(async (tx) => {
    // No bowl means nothing to leave; lockOpenBowl lets that through.
    await lockOpenBowl(tx, meetingId);
    await tx
      .delete(prayerRequests)
      .where(and(eq(prayerRequests.meetingId, meetingId), eq(prayerRequests.authorId, userId)));
    await tx
      .delete(prayerParticipants)
      .where(
        and(eq(prayerParticipants.meetingId, meetingId), eq(prayerParticipants.userId, userId)),
      );
  });
}

export async function drawPrayerBowl(
  userId: string,
  meetingId: string,
): Promise<{ drew: boolean }> {
  const meeting = await requireMeetingMember(userId, meetingId);

  return db.transaction(async (tx) => {
    // The guarded transition. The UPDATE takes the row lock, so of any number
    // of simultaneous draws exactly one flips open → drawn; the rest wait,
    // re-check the WHERE once it commits, match nothing, and fall through.
    const [flipped] = await tx
      .update(prayerSessions)
      .set({ status: "drawn", drawnBy: userId, drawnAt: new Date() })
      .where(and(eq(prayerSessions.meetingId, meetingId), eq(prayerSessions.status, "open")))
      .returning({ meetingId: prayerSessions.meetingId });

    if (!flipped) {
      const [bowl] = await tx
        .select({ status: prayerSessions.status })
        .from(prayerSessions)
        .where(eq(prayerSessions.meetingId, meetingId));
      // Already drawn — by someone else, a moment ago. What the tap asked for
      // has happened, so this is a no-op rather than an error.
      if (bowl?.status === "drawn") return { drew: false };
      // No bowl at all: nobody has joined, so there is nothing to draw.
      throw new Error("too-few-requests");
    }

    // Only requests from people still in the group. Someone removed after
    // writing would draw a request they can never open, and theirs would
    // reach someone else unread, so they are left out entirely.
    const requests = await tx
      .select({ id: prayerRequests.id, authorId: prayerRequests.authorId })
      .from(prayerRequests)
      .innerJoin(
        member,
        and(eq(member.userId, prayerRequests.authorId), eq(member.organizationId, meeting.groupId)),
      )
      .where(eq(prayerRequests.meetingId, meetingId))
      .orderBy(asc(prayerRequests.id));

    // Throwing rolls the transition back, so the bowl stays open for more.
    if (requests.length < 2) throw new Error("too-few-requests");

    // Nobody who's in gets left behind: while anyone has joined without
    // writing, the bowl waits for them to write or leave. Read after the
    // UPDATE, like the requests above, so a join can't slip in between this
    // check and the transition. Current members only, matching the buckets.
    const [stillWriting] = await tx
      .select({ userId: prayerParticipants.userId })
      .from(prayerParticipants)
      .innerJoin(
        member,
        and(eq(member.userId, prayerParticipants.userId), eq(member.organizationId, meeting.groupId)),
      )
      .leftJoin(
        prayerRequests,
        and(
          eq(prayerRequests.meetingId, meetingId),
          eq(prayerRequests.authorId, prayerParticipants.userId),
        ),
      )
      .where(and(eq(prayerParticipants.meetingId, meetingId), isNull(prayerRequests.id)))
      .limit(1);
    if (stillWriting) throw new Error("still-writing");

    // Request i goes to the author of request p[i]. p has no fixed points and
    // each author wrote exactly one request, so nobody draws their own.
    const p = derangement(requests.length, cryptoRandom);
    await tx.insert(prayerAssignments).values(
      requests.map((request, i) => ({
        requestId: request.id,
        meetingId,
        assigneeId: requests[p[i]].authorId,
      })),
    );
    return { drew: true };
  });
}

// The read model behind the meeting page's prayer section. It reveals who is
// in — names, never words — plus the viewer's own request so they can edit
// it. It checks membership itself rather than trusting the page to have done
// so: a leak here is the feature's one unforgivable failure.
export async function getPrayerBowl(viewerId: string, meetingId: string): Promise<PrayerBowl> {
  const meeting = await requireMeetingMember(viewerId, meetingId);

  const [[session], members, participants, authors, own] = await Promise.all([
    db
      .select({ status: prayerSessions.status })
      .from(prayerSessions)
      .where(eq(prayerSessions.meetingId, meetingId)),
    listMembers(meeting.groupId),
    db
      .select({ userId: prayerParticipants.userId })
      .from(prayerParticipants)
      .where(eq(prayerParticipants.meetingId, meetingId)),
    // Who wrote — and deliberately nothing else. Bodies are not selected
    // here, so they cannot leak from here.
    db
      .select({ userId: prayerRequests.authorId })
      .from(prayerRequests)
      .where(eq(prayerRequests.meetingId, meetingId)),
    db
      .select({ body: prayerRequests.body, includeName: prayerRequests.includeName })
      .from(prayerRequests)
      .where(and(eq(prayerRequests.meetingId, meetingId), eq(prayerRequests.authorId, viewerId))),
  ]);

  const joined = new Set(participants.map((p) => p.userId));
  const wrote = new Set(authors.map((a) => a.userId));
  // Buckets come from the group's *current* members, so anyone removed from
  // the group drops out of every list.
  const people = members
    .map((m) => ({ userId: m.userId, name: m.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  let drawn: PrayerBowl["drawn"] = null;
  if (session?.status === "drawn") {
    const [assigned] = await db
      .select({
        body: prayerRequests.body,
        includeName: prayerRequests.includeName,
        authorName: user.name,
      })
      .from(prayerAssignments)
      .innerJoin(prayerRequests, eq(prayerRequests.id, prayerAssignments.requestId))
      .innerJoin(user, eq(user.id, prayerRequests.authorId))
      .where(
        and(eq(prayerAssignments.meetingId, meetingId), eq(prayerAssignments.assigneeId, viewerId)),
      );
    if (assigned) {
      // The writer's name leaves the server only if they signed it — and no
      // author id is returned at all, signed or not.
      drawn = {
        body: assigned.body,
        authorName: assigned.includeName ? assigned.authorName : null,
      };
    }
  }

  return {
    meetingId,
    status: session?.status ?? "open",
    submitted: people.filter((p) => wrote.has(p.userId)),
    waiting: people.filter((p) => joined.has(p.userId) && !wrote.has(p.userId)),
    notJoined: people.filter((p) => !joined.has(p.userId)),
    viewer: { joined: joined.has(viewerId), request: own[0] ?? null },
    drawn,
  };
}

export type DrawnPrayer = {
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
  body: string;
  authorName: string | null;
};

// Every request this member has drawn in this group, newest meeting first, so
// past weeks stay prayable. The assignee filter is the whole privacy story:
// this can only ever return requests drawn *by* the caller.
export async function listMyDrawnPrayers(userId: string, groupId: string): Promise<DrawnPrayer[]> {
  await requireMembership(userId, groupId);
  const rows = await db
    .select({
      meetingId: meetings.id,
      meetingTitle: meetings.title,
      meetingDate: meetings.date,
      body: prayerRequests.body,
      includeName: prayerRequests.includeName,
      authorName: user.name,
    })
    .from(prayerAssignments)
    .innerJoin(prayerRequests, eq(prayerRequests.id, prayerAssignments.requestId))
    .innerJoin(meetings, eq(meetings.id, prayerAssignments.meetingId))
    .innerJoin(user, eq(user.id, prayerRequests.authorId))
    .where(and(eq(prayerAssignments.assigneeId, userId), eq(meetings.groupId, groupId)))
    .orderBy(desc(meetings.date), desc(meetings.createdAt));

  // Same rule as the meeting page: a name leaves the server only if signed.
  return rows.map(({ includeName, authorName, ...prayer }) => ({
    ...prayer,
    authorName: includeName ? authorName : null,
  }));
}
