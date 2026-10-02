import * as Sentry from "@sentry/nextjs";
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
// every error it catches while handling a request, and awaits it. On Node the
// SDK sends the error in the background, and nothing keeps a Vercel function
// alive for that once the response is out, so wait for the send here.
export async function onRequestError(...args: Parameters<typeof Sentry.captureRequestError>) {
  Sentry.captureRequestError(...args);
  await Sentry.flush(2000);
}
