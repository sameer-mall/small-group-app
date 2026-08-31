import Link from "next/link";
import { formatMeetingDate } from "@/lib/utils";
import type { Meeting } from "@/lib/meetings";

export function MeetingRow({ meeting }: { meeting: Meeting }) {
  return (
    <Link
      href={`/meetings/${meeting.id}`}
      className="bg-card rounded-card shadow-card min-h-tap flex flex-col justify-center gap-1 px-4 py-3"
    >
      <span className="font-serif text-lg font-semibold">{meeting.title}</span>
      <span className="text-muted-foreground text-sm">{formatMeetingDate(meeting.date)}</span>
    </Link>
  );
}
