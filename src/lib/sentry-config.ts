import type { ErrorEvent, EventHint } from "@sentry/nextjs";

// The one place Sentry's options are decided; instrumentation.ts (server) and
// instrumentation-client.ts (browser) both spread these. Imported by both, so
// it must stay free of Node and database imports.
//
// Privacy rule for everything sent to Sentry: ids and codes only. Never a
// prayer request, a note, a name, an email address, or a sign-in code. See
// docs/superpowers/plans/2026-10-01-06-error-monitoring.md, "Decisions".

// Sentry v11 collects cookies, HTTP bodies, user info, and database query
// data unless told otherwise. These are the v10 defaults, copied from Sentry's
// v10→v11 migration guide.
const DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
    response: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
  },
  httpBodies: [],
  urlQueryParams: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
};

// Drizzle's DrizzleQueryError message ends "\nparams: <every bound value>",
// and those values are whatever was being written: a prayer request, a note.
// Keep the query, which says what failed, and drop the values.
const QUERY_PARAMS = /\nparams: [\s\S]*$/;

function scrubText(text: string): string {
  return text.replace(QUERY_PARAMS, "\nparams: [scrubbed]");
}

export function scrubEvent(event: ErrorEvent, hint: EventHint): ErrorEvent {
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubText(exception.value);
  }
  if (event.message) event.message = scrubText(event.message);
  for (const breadcrumb of event.breadcrumbs ?? []) {
    if (breadcrumb.message) breadcrumb.message = scrubText(breadcrumb.message);
    // A console breadcrumb keeps the raw arguments that were logged (Better
    // Auth logs a failed email send with its error), unscrubbed. The message
    // above already says what was logged.
    if (breadcrumb.category === "console") delete breadcrumb.data;
  }
  // dataCollection already keeps these out. This makes sure.
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
  }
  // Next.js gives each server error a digest and sends only that digest to
  // the browser. Tagging the server's event with it lets the error screen's
  // event (tagged with the same digest) lead straight here.
  const original = hint.originalException;
  if (typeof original === "object" && original !== null && "digest" in original) {
    if (typeof original.digest === "string") event.tags = { ...event.tags, digest: original.digest };
  }
  return event;
}

export function sharedSentryOptions() {
  return {
    // Read straight from process.env, not src/lib/env.ts: that module holds
    // server secrets and must never reach the browser, and Next only inlines a
    // NEXT_PUBLIC_ variable into the browser bundle when it's written out like
    // this. Unset locally and in e2e, which turns the SDK off.
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "local",
    dataCollection: DATA_COLLECTION,
    beforeSend: scrubEvent,
  };
}
