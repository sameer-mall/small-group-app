import type { Breadcrumb, ErrorEvent, EventHint, ReplayFrameEvent } from "@sentry/nextjs";

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

// A click or keypress breadcrumb names the element by its tag, classes, and
// attributes (htmlTreeAsString in @sentry/browser-utils), and three of those
// attributes carry visible copy: [aria-label="Manage Ruth Smith"]. The value
// isn't escaped, so it ends at the `"]` that starts the next attribute, the
// next element (" > "), or the end of the message.
const LABEL_ATTRIBUTE = /\[(aria-label|title|alt)="[\s\S]*?"\](?=\[|\s>\s|$)/g;

// Runs as each breadcrumb is recorded, on the server and in the browser, so
// every event carries scrubbed breadcrumbs: a problem report too, though
// Sentry runs beforeSend only for errors.
export function scrubBreadcrumb<B extends Breadcrumb>(breadcrumb: B): B | null {
  // A console breadcrumb keeps whatever was logged: the dev fallback for
  // sign-in emails prints the address and code, and Better Auth logs a failed
  // query with its values.
  if (breadcrumb.category === "console") return null;
  if (breadcrumb.message === undefined) return breadcrumb;
  let message = breadcrumb.message;
  if (breadcrumb.category?.startsWith("ui.")) {
    message = message.replace(LABEL_ATTRIBUTE, '[$1="[filtered]"]');
  }
  return { ...breadcrumb, message: scrubText(message) };
}

// The replay records its own click breadcrumbs from the live page, outside
// beforeBreadcrumb, so its timeline goes through the same scrub.
export function scrubRecordingEvent(event: ReplayFrameEvent): ReplayFrameEvent | null {
  // 5 is rrweb's custom event, the only kind the SDK hands this hook.
  if (event.type !== 5 || event.data.tag !== "breadcrumb") return event;
  const payload = scrubBreadcrumb(event.data.payload);
  return payload ? { ...event, data: { ...event.data, payload } } : null;
}

// Sentry runs this for errors only. Their breadcrumbs were already scrubbed
// as they were recorded (scrubBreadcrumb).
export function scrubEvent(event: ErrorEvent, hint: EventHint): ErrorEvent {
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubText(exception.value);
  }
  if (event.message) event.message = scrubText(event.message);
  // dataCollection already keeps these out. This makes sure.
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
  }
  // onRequestError reports the raw path, query string and all, where the
  // query-parameter filter doesn't reach. An OAuth callback's carries the code.
  const nextjs = event.contexts?.nextjs;
  if (typeof nextjs?.request_path === "string") nextjs.request_path = nextjs.request_path.split("?")[0];
  // Next.js gives each server error a digest and sends only that digest to
  // the browser. Tagging the server's event with it lets the error screen's
  // event (tagged with the same digest) lead straight here.
  const original = hint.originalException;
  if (typeof original === "object" && original !== null && "digest" in original) {
    if (typeof original.digest === "string") event.tags = { ...event.tags, digest: original.digest };
  }
  return event;
}

// Whether a browser error takes a replay (the replay's beforeErrorSampling).
// Only an error a member saw does: the error screen tags it with the
// reference it shows (src/components/error-screen.tsx).
export function reachedErrorScreen(event: ErrorEvent): boolean {
  return typeof event.tags?.ref === "string";
}

export function sharedSentryOptions() {
  return {
    // Read straight from process.env, not src/lib/env.ts: that module holds
    // server secrets and must never reach the browser, and Next only inlines a
    // NEXT_PUBLIC_ variable into the browser bundle when it's written out like
    // this. Unset locally and in e2e, which turns the SDK off. On the server,
    // undefined falls back to SENTRY_DSN if that's set, so it stays unset too.
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "local",
    dataCollection: DATA_COLLECTION,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
    // Drizzle's spans carry every bound value (drizzle.query.params), which
    // databaseQueryData doesn't cover. drizzle-orm 0.45 doesn't emit them yet.
    ignoreSpans: [/^drizzle\./],
  };
}
