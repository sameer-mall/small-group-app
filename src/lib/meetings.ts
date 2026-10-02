import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { meetings, notes } from "@/db/schema";
import { requireMembership } from "@/lib/membership";

export type Meeting = {
  id: string;
  groupId: string;
  title: string;
  date: string;
  createdBy: string;
};

// Loads the meeting and confirms the actor may manage it: its creator, or an
// admin of its group. Any non-member fails the membership check first.
async function requireMeetingManager(userId: string, meetingId: string): Promise<Meeting> {
  const meeting = await getMeeting(meetingId);
  if (!meeting) throw new Error("not-found");
  const membership = await requireMembership(userId, meeting.groupId);
  if (meeting.createdBy !== userId && membership.role !== "admin") {
    throw new Error("forbidden");
  }
  return meeting;
}

export async function createMeeting(
  userId: string,
  groupId: string,
  input: { title: string; date: string },
): Promise<{ meetingId: string }> {
  await requireMembership(userId, groupId);
  const [row] = await db
    .insert(meetings)
    .values({ groupId, title: input.title, date: input.date, createdBy: userId })
    .returning({ id: meetings.id });
  return { meetingId: row.id };
}

export async function getMeeting(meetingId: string): Promise<Meeting | null> {
  const [row] = await db
    .select({
      id: meetings.id,
      groupId: meetings.groupId,
      title: meetings.title,
      date: meetings.date,
      createdBy: meetings.createdBy,
    })
    .from(meetings)
    .where(eq(meetings.id, meetingId));
  return row ?? null;
}

// Date ascending, and deliberately clock-free. "Upcoming" vs "past" depends on
// the viewer's local date, which this process does not know: the host runs UTC,
// where new Date() rolls over to tomorrow at 8pm US Eastern — dropping that
// evening's meeting into "past" while the group is still sitting in it. The
// split therefore belongs in the UI (Task 2), where the browser's timezone is
// known. Staying clock-free also makes this function's test deterministic.
export async function listMeetings(groupId: string): Promise<Meeting[]> {
  return db
    .select({
      id: meetings.id,
      groupId: meetings.groupId,
      title: meetings.title,
      date: meetings.date,
      createdBy: meetings.createdBy,
    })
    .from(meetings)
    .where(eq(meetings.groupId, groupId))
    .orderBy(asc(meetings.date));
}

export async function updateMeeting(
  userId: string,
  meetingId: string,
  input: { title: string; date: string },
): Promise<void> {
  await requireMeetingManager(userId, meetingId);
  await db
    .update(meetings)
    .set({ title: input.title, date: input.date })
    .where(eq(meetings.id, meetingId));
}

export async function deleteMeeting(userId: string, meetingId: string): Promise<void> {
  const meeting = await requireMeetingManager(userId, meetingId);
  // The meal plan and its items/claims cascade from the FK chain, but notes
  // don't: a note outlives its meeting, carrying a snapshot of the title and
  // date it showed when last saved. Refresh every note's snapshot from the
  // live meeting right before it's gone, in the same transaction as the
  // delete, so a meeting renamed or moved since a note's last save still
  // leaves the final title and date behind rather than a stale one.
  await db.transaction(async (tx) => {
    await tx
      .update(notes)
      .set({ meetingTitle: meeting.title, meetingDate: meeting.date })
      .where(eq(notes.meetingId, meetingId));
    await tx.delete(meetings).where(eq(meetings.id, meetingId));
  });
}
