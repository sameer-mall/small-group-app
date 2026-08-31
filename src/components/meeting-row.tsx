import Link from "next/link";
import type { Meeting } from "@/lib/meetings";

// Meetings are stored as plain YYYY-MM-DD strings (see src/lib/meetings.ts),
// with no time-of-day or timezone attached. Formatting via Date requires
// pinning a UTC time-of-day and timezone — otherwise the browser's own
// timezone would shift the date by a day for anyone west of UTC, and it
// would render differently on the server (UTC) than in the browser,
// tripping a hydration mismatch.
function formatMeetingDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

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
