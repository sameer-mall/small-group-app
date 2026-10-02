import Link from "next/link";
import type { MyNote } from "@/lib/notes";
import { formatMeetingDate } from "@/lib/utils";

// One card per note, newest meeting first, each opening where the note is
// read in full and edited: its meeting page, or — when the meeting was
// deleted — the note's own page (/notes/[id]). The body clamps at four lines
// here; a title never truncates.
export function NoteList({ notes }: { notes: MyNote[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {notes.map((note) => {
        const date = formatMeetingDate(note.meetingDate, { month: "short", day: "numeric" });
        return (
          <Link
            key={note.noteId}
            href={note.meetingId ? `/meetings/${note.meetingId}` : `/notes/${note.noteId}`}
            className="bg-card rounded-card shadow-card flex flex-col gap-2 p-5"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-serif text-[17px] font-semibold break-words">
                {note.meetingTitle}
              </span>
              <span className="text-tertiary shrink-0 text-right text-xs">
                {note.meetingId ? date : `${date} · Meeting deleted`}
              </span>
            </div>
            <p className="text-prayer line-clamp-4 text-[15px] leading-[1.55] break-words whitespace-pre-line">
              {note.body}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
