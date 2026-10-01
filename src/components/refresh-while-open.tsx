"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

// While the bowl is open, every screen in the room should show who has joined
// and who has written without anyone pulling to refresh. Five seconds is
// indistinguishable from realtime for ten people, and needs no websocket —
// the parent spec rules those out for v1. It uses router.refresh() rather
// than SWR: SWR would need a GET endpoint, an API layer the same spec rules
// out. Skipped while the tab is hidden (RefreshOnFocus catches up when it
// returns), and mounted only while the bowl is open, so polling stops by
// itself once the bowl is drawn.
//
// A meeting that was never drawn still mounts this (no bowl row reads as
// "open"), so without a further guard every undrawn meeting — past or
// future, visited or merely left open in a tab — would poll forever. The
// guard below starts the interval only when the meeting is within a day of
// the *viewer's* local today, same pattern as meeting-list.tsx: the server
// can't know the viewer's timezone, so getLocalToday reads the browser's
// clock and useSyncExternalStore reconciles it with the server-rendered
// guess without an effect or a hydration mismatch.
function subscribeToNothing() {
  return () => {};
}

function getLocalToday() {
  return new Date().toLocaleDateString("en-CA");
}

// Whole days from one YYYY-MM-DD to another, via UTC midnights so a daylight
// saving change can't shift the count. Same approach as
// drawn-prayer-list.tsx's daysBetween.
function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function RefreshWhileOpen({
  meetingDate,
  serverToday,
  intervalMs = 5000,
}: {
  meetingDate: string;
  serverToday: string;
  intervalMs?: number;
}) {
  const router = useRouter();
  const today = useSyncExternalStore(subscribeToNothing, getLocalToday, () => serverToday);
  const withinWindow = Math.abs(daysBetween(meetingDate, today)) <= 1;

  useEffect(() => {
    if (!withinWindow) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [router, intervalMs, withinWindow]);

  return null;
}
