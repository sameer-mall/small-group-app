import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions } from "@/lib/sentry-config";

Sentry.init({
  ...sharedSentryOptions(),
  integrations: [
    Sentry.replayIntegration({
      // Sentry's defaults, spelled out so a future default can't loosen them.
      // Prayer requests and notes are on these screens: a replay shows the
      // layout and the taps, never the words.
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
      networkDetailAllowUrls: [],
    }),
  ],
  // Never record whole sessions. Keep the last minute in memory and upload it
  // only when an error happens or "Report a problem" opens
  // (src/lib/problem-report.ts).
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
});
