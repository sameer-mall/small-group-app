import { cn } from "@/lib/utils";
import type { BowlMember } from "@/lib/prayers";

// The viewer reads as "You", first in whichever bucket they're in — 3n shows
// "You, Sarah, Dan, Ruth".
function namesFor(list: BowlMember[], currentUserId: string) {
  const includesMe = list.some((m) => m.userId === currentUserId);
  const others = list.filter((m) => m.userId !== currentUserId).map((m) => m.name);
  return (includesMe ? ["You", ...others] : others).join(", ");
}

export function PrayerBuckets({
  submitted,
  waiting,
  notJoined,
  currentUserId,
}: {
  submitted: BowlMember[];
  waiting: BowlMember[];
  notJoined: BowlMember[];
  currentUserId: string;
}) {
  const rows = [
    { glyph: "✓", glyphClass: "text-success font-bold", label: "Submitted", members: submitted, namesClass: "font-semibold" },
    { glyph: "…", glyphClass: "text-primary font-bold", label: "Waiting on", members: waiting, namesClass: "" },
    { glyph: "○", glyphClass: "text-slot-dashed", label: "Not joined", members: notJoined, namesClass: "text-tertiary" },
  ].filter((row) => row.members.length > 0);

  return (
    <div className="flex flex-col gap-2.5 text-[14.5px]">
      {rows.map((row) => (
        <div key={row.label} className="flex flex-wrap items-center gap-2">
          <span aria-hidden className={row.glyphClass}>
            {row.glyph}
          </span>
          <span className="text-muted-foreground w-[82px] shrink-0 text-[13px]">{row.label}</span>
          {/* A long list of names wraps onto further lines; it never truncates. */}
          <span className={cn("min-w-0 break-words", row.namesClass)}>
            {namesFor(row.members, currentUserId)}
          </span>
        </div>
      ))}
    </div>
  );
}
