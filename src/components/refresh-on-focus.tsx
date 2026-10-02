"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// A phone that has been in a pocket for ten minutes comes back showing claims
// as they were when the page was last rendered. Refreshing when the tab
// regains focus is what stops two people driving to the store for the same
// bag of chips. This component does that and nothing else. The "online"
// refresh is the soft replacement for the service worker's hard reload on
// reconnect: router.refresh() keeps client state, and the note card's own
// guard keeps the server value from overwriting typing.
export function RefreshOnFocus() {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => router.refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  return null;
}
