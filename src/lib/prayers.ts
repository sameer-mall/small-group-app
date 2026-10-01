import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { meetings, prayerParticipants, prayerRequests, prayerSessions } from "@/db/schema";
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

export async function joinPrayerBowl(userId: string, meetingId: string): Promise<void> {
  await requireMeetingMember(userId, meetingId);
  await db.transaction(async (tx) => {
    await ensureBowl(tx, meetingId, userId);
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
  await db
    .delete(prayerRequests)
    .where(and(eq(prayerRequests.meetingId, meetingId), eq(prayerRequests.authorId, userId)));
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

  return {
    meetingId,
    status: session?.status ?? "open",
    submitted: people.filter((p) => wrote.has(p.userId)),
    waiting: people.filter((p) => joined.has(p.userId) && !wrote.has(p.userId)),
    notJoined: people.filter((p) => !joined.has(p.userId)),
    viewer: { joined: joined.has(viewerId), request: own[0] ?? null },
    drawn: null,
  };
}
