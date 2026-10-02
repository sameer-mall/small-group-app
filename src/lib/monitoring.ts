import * as Sentry from "@sentry/nextjs";
import { after } from "next/server";

// Server-side records of what goes wrong without throwing, so that "it said I
// couldn't" or "my code never came" has something behind it in Sentry.
// Ids and codes only: never a prayer request, a note, a name, an email
// address, or a sign-in code (see src/lib/sentry-config.ts).

// The SDK holds logs for a few seconds and sends errors in the background,
// and a Vercel function can go idle as soon as its response is sent. Next
// keeps the function running for `after`, so send them from there.
// src/instrumentation.ts also calls this, for the render path Next doesn't
// await onRequestError on.
export function flushAfterResponse() {
  try {
    after(() => Sentry.flush(2000));
  } catch {
    // `after` throws outside a request (a script, a test). Nothing to keep
    // alive there.
  }
}

// The domain modules refuse with short kebab-case codes ("forbidden",
// "not-found", "session-closed", ...). Anything else is a real fault: the
// action rethrows it and Sentry captures it as an error, so it isn't logged
// here as well.
const REFUSAL_CODE = /^[a-z]+(-[a-z]+)*$/;

// First thing in an action's refusal mapping. The log carries the signed-in
// user's id (requireUser sets it), so a member's report can be matched to what
// the server refused them.
export function logRefusal(err: unknown) {
  if (err instanceof Error && REFUSAL_CODE.test(err.message)) {
    Sentry.logger.warn("Action refused", { reason: err.message });
    flushAfterResponse();
  }
}

export function logEmailSent(resendId: string) {
  Sentry.logger.info("Sign-in code email sent", { resendId });
  flushAfterResponse();
}

// A sign-in code that never left means someone can't get in. Captured as an
// error, not a log, so it opens an issue and emails the owner.
export function reportEmailFailure(err: unknown) {
  Sentry.captureException(err, { tags: { area: "sign-in-email" } });
  flushAfterResponse();
}

// Next calls the server's onRequestError hook twice for one page load that
// throws in a server component: once for the server-component render
// (context.renderSource "react-server-components") and again for the HTML
// render that replays the same error ("server-rendering"). Both carry the
// same `digest`, but Sentry's dedupe integration doesn't catch it, since the
// two calls are unrelated as far as it's concerned. Key on the digest plus
// the request's identity: Vercel sets an `x-vercel-id` header once per
// request, and both passes of one page load share it; locally, where there's
// no such header, fall back to the path. The path fallback means two
// near-simultaneous unrelated local requests to the same path could get
// merged into one report, which is harmless locally since there's nobody to
// lose a report on.
const seenDigests = new Map<string, number>();
const REPEAT_REPORT_WINDOW_MS = 10_000;

export function isRepeatReport(
  error: unknown,
  request: { path: string; headers: Record<string, string | string[] | undefined> },
  now = Date.now(),
): boolean {
  const digest =
    typeof error === "object" && error !== null && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : undefined;
  if (!digest) return false;

  for (const [key, firstSeenAt] of seenDigests) {
    if (now - firstSeenAt > REPEAT_REPORT_WINDOW_MS) seenDigests.delete(key);
  }

  const vercelId = request.headers["x-vercel-id"];
  const key = `${digest}:${typeof vercelId === "string" ? vercelId : request.path}`;
  if (seenDigests.has(key)) return true;
  seenDigests.set(key, now);
  return false;
}
