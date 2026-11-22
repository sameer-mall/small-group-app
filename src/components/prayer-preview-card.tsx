import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Avatar } from "@/components/avatar";
import { YouArePrayingFor } from "@/components/you-are-praying-for";
import { getPrayerWall } from "@/lib/prayers";
import { cn, formatMeetingDate } from "@/lib/utils";

export async function PrayerPreviewCard({
  meetingId,
  meetingDate,
  currentUserId,
}: {
  meetingId: string;
  meetingDate: string;
  currentUserId: string;
}) {
  const wall = await getPrayerWall(currentUserId, meetingId);
  const assigned = wall.status === "drawn";
  const href = `/meetings/${meetingId}/prayers`;
  const newest = wall.requests.slice(0, 2);
  const more = wall.requests.length - newest.length;

  return (
    <section className="bg-card rounded-card shadow-card flex flex-col gap-3 p-[18px]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-[19px] font-semibold">Prayer wall</h2>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs",
            assigned ? "bg-success-tint text-success" : "bg-surface-tint text-muted-foreground",
          )}
        >
          {assigned
            ? `Assigned · ${formatMeetingDate(meetingDate, { month: "short", day: "numeric" })}`
            : `${wall.requests.length} ${wall.requests.length === 1 ? "request" : "requests"}`}
        </span>
      </div>
      {assigned ? (
        <>
          <YouArePrayingFor assigned={wall.assigned} posted={wall.mine !== null} />
          <Link href={href} className={cn(buttonVariants({ variant: "secondary", size: "pill" }), "self-start")}>
            See the whole wall ›
          </Link>
        </>
      ) : (
        <>
          {newest.length === 0 ? (
            <p className="text-muted-foreground text-[14.5px]">No requests yet. Be the first to share one.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {newest.map((r) => (
                <li key={r.id} className="flex items-start gap-2.5">
                  <Avatar name={r.name} image={r.image} />
                  <p className="text-prayer line-clamp-2 font-serif text-[15px] leading-normal break-words">{r.body}</p>
                </li>
              ))}
            </ul>
          )}
          {(more > 0 || !wall.mine) && newest.length > 0 && (
            <p className="text-muted-foreground text-[13px]">
              {[more > 0 ? `+ ${more} more` : null, wall.mine ? null : "You haven't posted yet"]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          <Link href={href} className={buttonVariants({ size: "block" })}>
            Open the prayer wall
          </Link>
        </>
      )}
    </section>
  );
}
