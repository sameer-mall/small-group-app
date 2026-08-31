"use client";

import { useSyncExternalStore } from "react";
import { MeetingRow } from "@/components/meeting-row";
import type { Meeting } from "@/lib/meetings";

// The local date never changes while the page is mounted, so there is nothing
// to subscribe to; React only needs a valid unsubscribe back.
function subscribeToNothing() {
  return () => {};
}

function getLocalToday() {
  return new Date().toLocaleDateString("en-CA");
}

export function MeetingList({
  meetings,
  serverToday,
}: {
  meetings: Meeting[];
  serverToday: string;
}) {
  // "Today" differs between the server and the viewer: the host runs UTC, which
  // is already a day ahead of members in the Americas by evening, so a
  // server-computed cutoff would drop that evening's meeting into Past while
  // the group was still in it. useSyncExternalStore is React's primitive for
  // exactly this shape — getServerSnapshot supplies the value hydration must
  // match, getSnapshot supplies the browser's real local date, and React
  // re-renders once if they differ. No effect, no setState, nothing to
  // suppress. "en-CA" formats as YYYY-MM-DD, the same shape the dates are
  // stored in, so the comparisons below are plain string comparisons with no
  // Date parsing and no timezone conversion.
  const today = useSyncExternalStore(subscribeToNothing, getLocalToday, () => serverToday);

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
