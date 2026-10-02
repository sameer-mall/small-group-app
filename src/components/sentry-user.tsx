"use client";

import { useEffect } from "react";
import { identifyUser } from "@/lib/problem-report";

// Tells the browser's Sentry who is signed in, so errors and reports from this
// device can be matched to them. Renders nothing.
export function SentryUser({ id, name, email }: { id: string; name: string; email: string }) {
  useEffect(() => {
    identifyUser({ id, name, email });
  }, [id, name, email]);
  return null;
}
