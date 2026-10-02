import * as Sentry from "@sentry/nextjs";
import { flushAfterResponse, isRepeatReport } from "@/lib/monitoring";
import { sharedSentryOptions } from "@/lib/sentry-config";

export function register() {
  // Next 16's proxy runs on Node, and nothing in this app opts into the edge
  // runtime, so Node is the only server runtime to set up.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      ...sharedSentryOptions(),
      // The default, spelled out: a stack frame's local variables could hold
      // anything the request was handling.
      includeLocalVariables: false,
    });
  }
}

// Server components, server actions, and route handlers. Next calls this with
// every error it catches while handling a request. For server actions and
// route handlers it awaits this hook, so the awaited flush below covers
// those. For errors thrown while rendering a server component, Next doesn't
// await this hook, so that awaited flush can get dropped once the response
// is out; flushAfterResponse's `after` call covers that render path instead.
// A server-component render error also gets reported here a second time,
// once Next replays it for the HTML render; isRepeatReport (src/lib/
// monitoring.ts) catches that and this returns before capturing it again.
export async function onRequestError(...args: Parameters<typeof Sentry.captureRequestError>) {
  const [error, request] = args;
  if (isRepeatReport(error, request)) return;
  Sentry.captureRequestError(...args);
  flushAfterResponse();
  await Sentry.flush(2000);
}
