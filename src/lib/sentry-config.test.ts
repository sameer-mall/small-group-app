import { afterEach, describe, expect, it, vi } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { scrubEvent, sharedSentryOptions } from "./sentry-config";

// What Drizzle's DrizzleQueryError says when an insert fails: the query, then
// every bound value. Here one of those values is a prayer request.
const FAILED_INSERT =
  'Failed query: insert into "prayer_requests" ("id", "meeting_id", "author_id", "body") values ($1, $2, $3, $4)\n' +
  "params: r1,m1,u1,Please pray for my mother's surgery";

function eventWith(value: string): ErrorEvent {
  return { exception: { values: [{ type: "Error", value }] } } as ErrorEvent;
}

describe("scrubEvent", () => {
  it("keeps the failed query but drops the values it was writing", () => {
    const event = scrubEvent(eventWith(FAILED_INSERT), {});
    const value = event.exception!.values![0].value!;
    expect(value).toContain('insert into "prayer_requests"');
    expect(value).toContain("params: [scrubbed]");
    expect(JSON.stringify(event)).not.toContain("surgery");
  });

  it("scrubs a linked cause, the message, and breadcrumbs the same way", () => {
    const event = {
      message: FAILED_INSERT,
      exception: {
        values: [
          { type: "DrizzleQueryError", value: FAILED_INSERT },
          { type: "Error", value: "outer" },
        ],
      },
      breadcrumbs: [
        {
          category: "console",
          message: `Failed to run background task: ${FAILED_INSERT}`,
          data: { arguments: ["Failed to run background task:", FAILED_INSERT] },
        },
      ],
    } as unknown as ErrorEvent;
    expect(JSON.stringify(scrubEvent(event, {}))).not.toContain("surgery");
  });

  it("never sends a request body or cookies", () => {
    const event = {
      request: { url: "https://example.com/meetings/m1", data: "body=secret", cookies: { session: "abc" } },
    } as unknown as ErrorEvent;
    const scrubbed = scrubEvent(event, {});
    expect(scrubbed.request).toEqual({ url: "https://example.com/meetings/m1" });
  });

  it("tags a server error with its Next.js digest, so the error screen's event leads to it", () => {
    const error = Object.assign(new Error("boom"), { digest: "2847503921" });
    const event = scrubEvent(eventWith("boom"), { originalException: error });
    expect(event.tags).toEqual({ digest: "2847503921" });
  });

  it("leaves an ordinary error alone", () => {
    const event = scrubEvent(eventWith("Cannot read properties of undefined"), {
      originalException: new Error("Cannot read properties of undefined"),
    });
    expect(event.exception!.values![0].value).toBe("Cannot read properties of undefined");
    expect(event.tags).toBeUndefined();
  });
});

describe("sharedSentryOptions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("collects none of the extra data Sentry v11 collects by default", () => {
    expect(sharedSentryOptions().dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpBodies: [],
      databaseQueryData: false,
    });
  });

  it("stays off without a DSN, so local dev and e2e send nothing", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    expect(sharedSentryOptions().dsn).toBeUndefined();
  });

  it("labels events with the Vercel environment, or local", () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
    expect(sharedSentryOptions().environment).toBe("preview");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "");
    expect(sharedSentryOptions().environment).toBe("local");
  });
});
