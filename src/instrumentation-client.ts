import * as Sentry from "@sentry/nextjs";
import { isHeadlessBrowser, reachedErrorScreen, scrubRecordingEvent, sharedSentryOptions } from "@/lib/sentry-config";

Sentry.init({
  ...sharedSentryOptions(),
  // Vercel loads every deployment in a headless browser to check it before
  // marking it ready, and that visit isn't a member, so Sentry stays off for
  // it. The e2e suite runs headless as well.
  enabled: !isHeadlessBrowser(navigator.userAgent),
  integrations: [
    Sentry.replayIntegration({
      // Sentry's defaults, spelled out so a future default can't loosen them.
      // Prayer requests and notes are on these screens: a replay shows the
      // layout and the taps, never the words.
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
      networkDetailAllowUrls: [],
      // Sentry's default list plus "alt". These attributes carry visible copy,
      // a member's name included ("Manage Ruth Smith").
      maskAttributes: ["title", "placeholder", "aria-label", "alt"],
      // The replay names each tapped element in its own breadcrumbs, read off
      // the live page, unmasked. Scrub those like every other breadcrumb.
      beforeAddRecordingEvent: scrubRecordingEvent,
      // The plan allows 50 replays a month, and a stray rejection, a browser
      // extension, or a chunk that fails to load after a deploy would each
      // spend one. Only an error a member saw on an error screen does.
      beforeErrorSampling: reachedErrorScreen,
    }),
  ],
  // Never record whole sessions. Keep the last minute in memory and upload it
  // only when an error reaches an error screen or "Report a problem" opens
  // (src/lib/problem-report.ts).
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
});
