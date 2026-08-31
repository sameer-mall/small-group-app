"use client";

import { useEffect, useState } from "react";
import { MeetingRow } from "@/components/meeting-row";
import type { Meeting } from "@/lib/meetings";

export function MeetingList({
  meetings,
  serverToday,
}: {
  meetings: Meeting[];
  serverToday: string;
}) {
  // The server renders with serverToday so the hydration markup matches; the
  // browser's real local date arrives on mount and corrects the split. "en-CA"
  // formats as YYYY-MM-DD — the same shape the dates are stored in — so these
  // compare as plain strings, with no Date parsing and no timezone conversion.
  //
  // This is a one-shot correction of a value the server cannot know (the
  // viewer's local timezone), not state synchronized from a prop — the
  // react-hooks/set-state-in-effect rule's cascading-render concern doesn't
  // apply since the effect only ever runs once, on mount.
  const [today, setToday] = useState(serverToday);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setToday(new Date().toLocaleDateString("en-CA")), []);

  // `meetings` arrives date-ascending from the domain (src/lib/meetings.ts).
  // Upcoming keeps that order (soonest first); past is reversed (most recent
  // first).
  const upcoming = meetings.filter((meeting) => meeting.date >= today);
  const past = meetings.filter((meeting) => meeting.date < today).reverse();

  return (
    <div className="flex flex-col gap-6">
      {upcoming.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-muted-foreground tracking-label text-xs uppercase">Upcoming</h2>
          <div className="flex flex-col gap-2">
            {upcoming.map((meeting) => (
              <MeetingRow key={meeting.id} meeting={meeting} />
            ))}
          </div>
        </div>
      )}
      {past.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-muted-foreground tracking-label text-xs uppercase">Past</h2>
          <div className="flex flex-col gap-2">
            {past.map((meeting) => (
              <MeetingRow key={meeting.id} meeting={meeting} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
