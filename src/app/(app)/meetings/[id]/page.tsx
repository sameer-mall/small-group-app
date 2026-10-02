import { notFound } from "next/navigation";
import { requireMember, requireUser } from "@/lib/dal";
import { getMeeting } from "@/lib/meetings";
import { getMyNote } from "@/lib/notes";
import { saveNoteAction } from "@/app/(app)/notes/actions";
import { formatMeetingDate } from "@/lib/utils";
import { MeetingActionsMenu } from "@/components/meeting-actions-menu";
import { MealSection } from "@/components/meal-section";
import { PrayerSection } from "@/components/prayer-section";
import { NoteCard } from "@/components/note-card";
import { RefreshOnFocus } from "@/components/refresh-on-focus";

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/meetings/${id}`);

  const meeting = await getMeeting(id);
  if (!meeting) notFound();

  // getMeeting does no authorization — this is the group scoping guard, so a
  // member of some other group gets "forbidden" rather than a peek at the
  // title. It also gives us the role the manage check needs.
  const { role } = await requireMember(meeting.groupId);
  const canManage = meeting.createdBy === user.id || role === "admin";

  const note = await getMyNote(user.id, meeting.id);

  return (
    <main className="flex flex-col gap-6 p-6">
      <RefreshOnFocus />
      <div className="flex items-start gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <h1 className="font-serif text-2xl font-semibold">{meeting.title}</h1>
          <p className="text-muted-foreground text-sm">
            {formatMeetingDate(meeting.date, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        {canManage && <MeetingActionsMenu meeting={meeting} />}
      </div>
      <MealSection
        meetingId={meeting.id}
        groupId={meeting.groupId}
        currentUserId={user.id}
        isAdmin={role === "admin"}
      />
      <PrayerSection meetingId={meeting.id} meetingDate={meeting.date} currentUserId={user.id} />
      <NoteCard initialBody={note} save={saveNoteAction.bind(null, meeting.id)} />
    </main>
  );
}
