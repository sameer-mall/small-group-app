import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { getMyNoteById, type MyNote } from "@/lib/notes";
import { formatMeetingDate } from "@/lib/utils";
import { updateNoteAction } from "@/app/(app)/notes/actions";
import { DeleteNoteButton } from "@/components/delete-note-button";
import { NoteCard } from "@/components/note-card";

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/notes/${id}`);

  let note: MyNote;
  try {
    note = await getMyNoteById(user.id, id);
  } catch (err) {
    // Someone else's note, a deleted one, and one in a group you've left all
    // read as missing.
    if (err instanceof Error && (err.message === "not-found" || err.message === "forbidden")) {
      notFound();
    }
    throw err;
  }
  // A note whose meeting still exists is edited on the meeting page, beside
  // everything else about that night.
  if (note.meetingId) redirect(`/meetings/${note.meetingId}`);

  const date = formatMeetingDate(note.meetingDate, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <main className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-2xl font-semibold break-words">{note.meetingTitle}</h1>
        <p className="text-muted-foreground text-sm">{`${date} · Meeting deleted`}</p>
      </div>
      <NoteCard
        key={note.noteId}
        initialBody={note.body}
        save={updateNoteAction.bind(null, note.noteId)}
        emptyStatus="Empty notes aren't saved"
      />
      <DeleteNoteButton noteId={note.noteId} />
    </main>
  );
}
