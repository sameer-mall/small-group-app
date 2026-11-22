import { cn, formatMeetingDate } from "@/lib/utils";

// "4 requests" while the wall is open; "Assigned · Nov 26" once it's locked.
export function WallStatusPill({
  assigned,
  requestCount,
  meetingDate,
}: {
  assigned: boolean;
  requestCount: number;
  meetingDate: string;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-xs",
        assigned ? "bg-success-tint text-success" : "bg-surface-tint text-muted-foreground",
      )}
    >
      {assigned
        ? `Assigned · ${formatMeetingDate(meetingDate, { month: "short", day: "numeric" })}`
        : `${requestCount} ${requestCount === 1 ? "request" : "requests"}`}
    </span>
  );
}
