import Link from "next/link";
import { formatMeetingDate } from "@/lib/utils";
import type { MeetingWithPrayers } from "@/lib/meetings";

export function MeetingRow({ meeting }: { meeting: MeetingWithPrayers }) {
  return (
    <Link
      href={`/meetings/${meeting.id}`}
      className="bg-card rounded-card shadow-card min-h-tap flex flex-col justify-center gap-1.5 px-4 py-3"
    >
      <span className="font-serif text-lg font-semibold">{meeting.title}</span>
      <span className="text-muted-foreground text-sm">{formatMeetingDate(meeting.date)}</span>
      {meeting.prayerRequestCount > 0 && (
        <span className="bg-accent-tint text-button-secondary-foreground self-start rounded-full px-2.5 py-1 text-xs font-semibold">
          {`Prayer wall · ${meeting.prayerRequestCount} ${meeting.prayerRequestCount === 1 ? "request" : "requests"}`}
        </span>
      )}
    </Link>
  );
}
