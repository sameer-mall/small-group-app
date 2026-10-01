import { getPrayerBowl } from "@/lib/prayers";
import { cn, formatMeetingDate } from "@/lib/utils";
import { OpenPrayerBowl } from "@/components/open-prayer-bowl";
import { RefreshWhileOpen } from "@/components/refresh-while-open";

export async function PrayerSection({
  meetingId,
  meetingDate,
  currentUserId,
}: {
  meetingId: string;
  meetingDate: string;
  currentUserId: string;
}) {
  const bowl = await getPrayerBowl(currentUserId, meetingId);
  const drawn = bowl.status === "drawn";
  // Design doc, decision 2. The meeting's date-only value, not drawn_at — a
  // timestamp would reintroduce the timezone problem formatMeetingDate avoids.
  const badge = drawn
    ? `Drawn · ${formatMeetingDate(meetingDate, { month: "short", day: "numeric" })}`
    : bowl.submitted.length > 0
      ? "Gathering"
      : "Open";

  return (
    <section
      className={cn(
        "bg-card rounded-card shadow-card flex flex-col",
        drawn ? "gap-[18px] px-[22px] pt-[26px] pb-[22px]" : "gap-3.5 p-[18px]",
      )}
    >
      {!drawn && <RefreshWhileOpen />}
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-[19px] font-semibold">Prayer bowl</h2>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs",
            drawn ? "bg-success-tint text-success" : "bg-surface-tint text-muted-foreground",
          )}
        >
          {badge}
        </span>
      </div>
      {drawn ? null /* Task 5 renders the drawn state here. */ : (
        <OpenPrayerBowl bowl={bowl} meetingId={meetingId} currentUserId={currentUserId} />
      )}
    </section>
  );
}
