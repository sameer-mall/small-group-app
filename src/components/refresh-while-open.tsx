"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// While the bowl is open, every screen in the room should show who has joined
// and who has written without anyone pulling to refresh. Five seconds is
// indistinguishable from realtime for ten people, and needs no websocket —
// the parent spec rules those out for v1. It uses router.refresh() rather
// than SWR: SWR would need a GET endpoint, an API layer the same spec rules
// out. Skipped while the tab is hidden (RefreshOnFocus catches up when it
// returns), and mounted only while the bowl is open, so polling stops by
// itself once the bowl is drawn.
export function RefreshWhileOpen({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
