import { Avatar } from "@/components/avatar";
import type { PrayerWall } from "@/lib/prayers";

export function YouArePrayingFor({
  assigned,
  posted,
}: {
  assigned: PrayerWall["assigned"];
  posted: boolean;
}) {
  if (!assigned) {
    // Posted but holding no assignment: either the author they were given has
    // since left the group, or their own request was left out because they
    // weren't in the group when prayers were assigned. One line covers both.
    return (
      <p className="text-muted-foreground text-center text-[14.5px]">
        {posted
          ? "Prayers were assigned. There isn't a request for you to pray for this week."
          : "Prayers were assigned. You didn't post this time."}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-center text-[12.5px] font-bold tracking-[0.1em] uppercase">
        You&apos;re praying for
      </p>
      <blockquote className="text-prayer px-1.5 text-center font-serif text-[20px] leading-[1.6] break-words whitespace-pre-line">
        &quot;{assigned.body}&quot;
      </blockquote>
      <div className="flex items-center justify-center gap-2">
        <Avatar name={assigned.authorName} image={assigned.authorImage} />
        <span className="text-strong text-[14.5px]">From {assigned.authorName}</span>
      </div>
      <p className="text-muted-foreground text-center text-[13px]">Carry this with you through the week.</p>
    </div>
  );
}
