"use client";

import { useSyncExternalStore } from "react";
import { cn, formatMeetingDate } from "@/lib/utils";
import type { DrawnPrayer } from "@/lib/prayers";

function subscribeToNothing() {
  return () => {};
}

function getLocalToday() {
  return new Date().toLocaleDateString("en-CA");
}

// Whole days from one YYYY-MM-DD to another, via UTC midnights so a daylight
// saving change can't shift the count.
function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function DrawnPrayerList({
  prayers,
  serverToday,
}: {
  prayers: DrawnPrayer[];
  serverToday: string;
}) {
  const today = useSyncExternalStore(subscribeToNothing, getLocalToday, () => serverToday);

  return (
    <div className="flex flex-col gap-2.5">
      {prayers.map((prayer, index) => {
        const date = formatMeetingDate(prayer.meetingDate, { month: "short", day: "numeric" });
        const age = daysBetween(prayer.meetingDate, today);
        // "This week": the meeting fell within the seven days ending today.
        const label = age >= 0 && age < 7 ? `This week · ${date}` : date;
        return (
          <div key={prayer.meetingId} className="flex flex-col gap-2.5">
            <p
              className={cn(
                "text-tertiary tracking-label px-1 text-xs font-bold uppercase",
                index > 0 && "pt-2.5",
              )}
            >
              {label}
            </p>
            <article className="bg-card rounded-card shadow-card flex flex-col gap-2.5 p-5">
              <p className="text-prayer font-serif text-lg leading-[1.6] break-words whitespace-pre-line">
                &quot;{prayer.body}&quot;
              </p>
              <div className="flex justify-between gap-3 text-[13.5px]">
                {prayer.authorName ? (
                  <span className="text-muted-foreground">From {prayer.authorName}</span>
                ) : (
                  <span className="text-tertiary italic">Name not shared</span>
                )}
                <span className="text-tertiary text-right break-words">{prayer.meetingTitle}</span>
              </div>
            </article>
          </div>
        );
      })}
    </div>
  );
}
