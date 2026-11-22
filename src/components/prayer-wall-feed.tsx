import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/time-ago";
import type { WallRequest } from "@/lib/prayers";
import { Avatar } from "@/components/avatar";

export function PrayerWallFeed({
  requests,
  now,
  assigned = false,
  myRequestIsAssigned = false,
}: {
  requests: WallRequest[];
  now: Date;
  // Read-only record after assigning: times hidden, and the viewer's own
  // request says whether someone is praying for it.
  assigned?: boolean;
  myRequestIsAssigned?: boolean;
}) {
  if (requests.length === 0) {
    return (
      <p className="text-muted-foreground text-center text-[14.5px]">
        No requests yet. Be the first to share one.
      </p>
    );
  }
  // The viewer's own request leads, then everyone else newest first.
  const ordered = [...requests.filter((r) => r.isMine), ...requests.filter((r) => !r.isMine)];
  return (
    <ul className="flex flex-col gap-2.5" aria-label="Prayer requests">
      {ordered.map((request) => (
        <li
          key={request.id}
          data-testid="wall-request"
          className={cn(
            "flex flex-col gap-2 rounded-[14px] border p-3.5",
            request.isMine ? "bg-surface-tint border-warning-border" : "bg-surface-subtle border-divider",
          )}
        >
          <div className="flex items-center gap-2.5">
            <Avatar name={request.name} image={request.image} />
            <div className="flex min-w-0 flex-col">
              <span className="text-[14.5px] font-semibold break-words">
                {request.isMine ? "You" : request.name}
              </span>
              {!assigned && (
                <span className="text-muted-foreground text-xs">{timeAgo(request.updatedAt, now)}</span>
              )}
            </div>
          </div>
          <p className="text-prayer font-serif text-base leading-[1.55] break-words whitespace-pre-line">
            {request.body}
          </p>
          {request.isMine && myRequestIsAssigned && (
            <p className="text-success text-[12.5px] font-semibold">
              Someone in the group is praying for this
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
