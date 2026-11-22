import { cn } from "@/lib/utils";
import type { WallPerson } from "@/lib/prayers";

// The viewer reads as "You", first in whichever bucket they're in, so a row
// shows "You, Sarah, Dan, Ruth".
export function displayNames(list: WallPerson[], currentUserId: string) {
  const includesMe = list.some((m) => m.userId === currentUserId);
  const others = list.filter((m) => m.userId !== currentUserId).map((m) => m.name);
  return includesMe ? ["You", ...others] : others;
}

function namesFor(list: WallPerson[], currentUserId: string) {
  return displayNames(list, currentUserId).join(", ");
}

export function PrayerBuckets({
  writing,
  notJoined,
  currentUserId,
}: {
  writing: WallPerson[];
  notJoined: WallPerson[];
  currentUserId: string;
}) {
  const rows = [
    { glyph: "…", glyphClass: "text-primary font-bold", label: "Writing", members: writing, namesClass: "" },
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
