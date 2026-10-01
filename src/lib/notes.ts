import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { meetings, notes } from "@/db/schema";
import { requireMembership } from "@/lib/membership";

// Private notes: one per member per meeting. Privacy is the whole feature, so
// it is enforced here rather than in the UI — no function in this module
// accepts an author id other than the caller's own, and the reads check
// membership themselves (the same deliberate exception prayers.ts makes).
//
// A note outlives its meeting (see the notes table in schema.ts): writing and
// reading on the meeting page need the live meeting; the history doesn't.

export type MyNote = {
  noteId: string;
  // Null once the meeting has been deleted.
  meetingId: string | null;
  meetingTitle: string;
  meetingDate: string;
  body: string;
};

// Loads the meeting and confirms the actor belongs to its group. Every entry
// point starts from a meeting id the client supplied, so the group is read
// back off the row rather than trusted from the caller.
async function requireMeetingMember(userId: string, meetingId: string) {
  const [meeting] = await db
    .select({
      id: meetings.id,
      groupId: meetings.groupId,
      title: meetings.title,
      date: meetings.date,
    })
    .from(meetings)
    .where(eq(meetings.id, meetingId));
  if (!meeting) throw new Error("not-found");
  await requireMembership(userId, meeting.groupId);
  return meeting;
}

const ownNote = (userId: string, meetingId: string) =>
  and(eq(notes.meetingId, meetingId), eq(notes.authorId, userId));

// The caller's own note on a meeting, or "" if they haven't written one.
// Reading never creates a row.
export async function getMyNote(userId: string, meetingId: string): Promise<string> {
  await requireMeetingMember(userId, meetingId);
  const [row] = await db.select({ body: notes.body }).from(notes).where(ownNote(userId, meetingId));
  return row?.body ?? "";
}

// Writes the caller's note, as typed, and refreshes its copy of the meeting's
// title and date — what the history shows if the meeting is later deleted.
// An empty note is no note: clearing the text deletes the row, so My notes
// never lists a blank card.
export async function saveMyNote(userId: string, meetingId: string, body: string): Promise<void> {
  const meeting = await requireMeetingMember(userId, meetingId);
  if (body.trim() === "") {
    await db.delete(notes).where(ownNote(userId, meetingId));
    return;
  }
  const snapshot = { meetingTitle: meeting.title, meetingDate: meeting.date };
  await db
    .insert(notes)
    .values({ groupId: meeting.groupId, meetingId, authorId: userId, body, ...snapshot })
    .onConflictDoUpdate({
      target: [notes.meetingId, notes.authorId],
      set: { body, ...snapshot, updatedAt: new Date() },
    });
}

// Every note the caller has written in this group — including those whose
// meeting was deleted — newest meeting first. A live meeting's current title
// and date win over the note's snapshot, so a renamed meeting reads right.
// The author filter is the whole privacy story: this can only ever return the
// caller's own notes.
export async function listMyNotes(userId: string, groupId: string): Promise<MyNote[]> {
  await requireMembership(userId, groupId);
  // ::text keeps the date a YYYY-MM-DD string through coalesce, as the
  // `mode: "string"` columns are everywhere else.
  const meetingDate = sql<string>`coalesce(${meetings.date}, ${notes.meetingDate})::text`;
  return db
    .select({
      noteId: notes.id,
      meetingId: notes.meetingId,
      meetingTitle: sql<string>`coalesce(${meetings.title}, ${notes.meetingTitle})`,
      meetingDate,
      body: notes.body,
    })
    .from(notes)
    .leftJoin(meetings, eq(meetings.id, notes.meetingId))
    .where(and(eq(notes.authorId, userId), eq(notes.groupId, groupId)))
    .orderBy(desc(meetingDate), desc(notes.createdAt));
}
