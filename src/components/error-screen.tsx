"use client";

import { useEffect, useRef, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { ReportProblemDialog } from "@/components/report-problem-dialog";
import { makeReference } from "@/lib/problem-report";

// What every error boundary shows (src/app/error.tsx, src/app/(app)/error.tsx,
// src/app/global-error.tsx). It reports the error tagged with a short
// reference the member can read out or text, so their "it broke" finds this
// exact event: search `ref:<code>` in Sentry.
export function ErrorScreen({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const [reference] = useState(makeReference);
  // Read when a report is sent, never during render.
  const eventId = useRef<string | undefined>(undefined);

  useEffect(() => {
    eventId.current = Sentry.captureException(
      error,
      error.digest
        ? {
            tags: { ref: reference, digest: error.digest },
            // A server error was already captured in full by onRequestError,
            // tagged with this same digest (src/lib/sentry-config.ts). The
            // browser only gets a generic stand-in, so these all group into
            // one issue rather than a duplicate per error; the digest leads
            // to the server's issue, which has the real stack.
            fingerprint: ["error-screen", "server-error"],
          }
        : { tags: { ref: reference } },
    );
  }, [error, reference]);

  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center p-6">
      <div className="bg-card rounded-card shadow-card flex w-full max-w-sm flex-col gap-4 p-6 text-center">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-xl font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground text-sm">
            Try again. If it keeps happening, report it so we can fix it.
          </p>
        </div>
        <p className="text-tertiary text-xs">
          Reference{" "}
          <span className="text-strong font-semibold tracking-[0.2em] tabular-nums">{reference}</span>
        </p>
        <Button type="button" size="block" onClick={() => retry()}>
          Try again
        </Button>
        <ReportProblemDialog
          label="Report this problem"
          look="block"
          getAssociatedEventId={() => eventId.current}
        />
      </div>
    </main>
  );
}
