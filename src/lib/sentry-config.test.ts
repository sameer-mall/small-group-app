import { afterEach, describe, expect, it, vi } from "vitest";
import type { ErrorEvent, ReplayFrameEvent } from "@sentry/nextjs";
import {
  reachedErrorScreen,
  scrubBreadcrumb,
  scrubEvent,
  scrubRecordingEvent,
  sharedSentryOptions,
} from "./sentry-config";

// What Drizzle's DrizzleQueryError says when an insert fails: the query, then
// every bound value. Here one of those values is a prayer request.
const FAILED_INSERT =
  'Failed query: insert into "prayer_requests" ("id", "meeting_id", "author_id", "body") values ($1, $2, $3, $4)\n' +
  "params: r1,m1,u1,Please pray for my mother's surgery";

function eventWith(value: string): ErrorEvent {
  return { exception: { values: [{ type: "Error", value }] } } as ErrorEvent;
}

// What Sentry's click breadcrumb says when an admin taps "Manage" on a
// member's row (src/components/member-row.tsx): htmlTreeAsString names the
// button by its classes and then its aria-label, which holds the member's name.
const MANAGE_CLICK =
  "li.flex > button.text-tertiary.min-h-tap.flex.min-w-[32px].items-center" +
  '[aria-label="Manage Ruth Smith"][type="button"]';

describe("scrubEvent", () => {
  it("keeps the failed query but drops the values it was writing", () => {
    const event = scrubEvent(eventWith(FAILED_INSERT), {});
    const value = event.exception!.values![0].value!;
    expect(value).toContain('insert into "prayer_requests"');
    expect(value).toContain("params: [scrubbed]");
    expect(JSON.stringify(event)).not.toContain("surgery");
  });

  it("scrubs a linked cause and the message the same way", () => {
    const event = {
      message: FAILED_INSERT,
      exception: {
        values: [
          { type: "DrizzleQueryError", value: FAILED_INSERT },
          { type: "Error", value: "outer" },
        ],
      },
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

  it("drops the query string from the path Next.js reports, which can hold an OAuth code", () => {
    const event = {
      contexts: { nextjs: { request_path: "/api/auth/callback/google?code=4/0Ab_secret&state=xyz", router_kind: "App Router" } },
    } as unknown as ErrorEvent;
    expect(scrubEvent(event, {}).contexts).toEqual({
      nextjs: { request_path: "/api/auth/callback/google", router_kind: "App Router" },
    });
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

// Breadcrumbs are scrubbed as they're recorded (beforeBreadcrumb), not as an
// event is sent: a problem report is a feedback event, and Sentry runs
// beforeSend only for errors.
describe("scrubBreadcrumb", () => {
  it("hides the label a tapped element is named by, so a member's name never leaves", () => {
    const scrubbed = scrubBreadcrumb({ category: "ui.click", message: MANAGE_CLICK });
    expect(scrubbed?.message).toBe(
      "li.flex > button.text-tertiary.min-h-tap.flex.min-w-[32px].items-center" +
        '[aria-label="[filtered]"][type="button"]',
    );
  });

  it("hides title and alt the same way, quotes in the label included", () => {
    const scrubbed = scrubBreadcrumb({
      category: "ui.click",
      message: 'a[title="Ruth\'s "famous" lasagna"] > img[alt="Ruth Smith"]',
    });
    expect(scrubbed?.message).toBe('a[title="[filtered]"] > img[alt="[filtered]"]');
  });

  it("drops console breadcrumbs, which carry whatever was logged", () => {
    const logged = "[auth email] sign-in code for ruth@example.com: 123456";
    expect(scrubBreadcrumb({ category: "console", message: logged, data: { arguments: [logged] } })).toBeNull();
  });

  it("keeps a failed query but drops the values it was writing", () => {
    const scrubbed = scrubBreadcrumb({ category: "sentry.event", message: `Failed to save: ${FAILED_INSERT}` });
    expect(scrubbed?.message).toContain('insert into "prayer_requests"');
    expect(scrubbed?.message).toContain("params: [scrubbed]");
    expect(JSON.stringify(scrubbed)).not.toContain("surgery");
  });

  it("leaves other breadcrumbs alone", () => {
    const navigation = { category: "navigation", data: { from: "/meals", to: "/prayers" } };
    expect(scrubBreadcrumb(navigation)).toEqual(navigation);
  });
});

// The replay records its own click breadcrumbs from the live page, outside
// beforeBreadcrumb.
describe("scrubRecordingEvent", () => {
  function recorded(payload: object): ReplayFrameEvent {
    return { type: 5, timestamp: 1_000, data: { tag: "breadcrumb", payload } } as ReplayFrameEvent;
  }

  it("scrubs a breadcrumb in the recording", () => {
    const event = scrubRecordingEvent(
      recorded({
        timestamp: 1,
        type: "default",
        category: "ui.click",
        message: MANAGE_CLICK,
        data: { nodeId: 12, node: { id: 12, tagName: "button", textContent: "*", attributes: {} } },
      }),
    );
    expect(event).toMatchObject({ type: 5, data: { tag: "breadcrumb", payload: { category: "ui.click" } } });
    expect(JSON.stringify(event)).not.toContain("Ruth Smith");
  });

  it("drops a console breadcrumb from the recording", () => {
    expect(
      scrubRecordingEvent(recorded({ timestamp: 1, type: "default", category: "console", message: "code 123456" })),
    ).toBeNull();
  });

  it("passes every other recording event through untouched", () => {
    const span = {
      type: 5,
      timestamp: 1_000,
      data: {
        tag: "performanceSpan",
        payload: { op: "navigation.push", description: "/meals", startTimestamp: 1, endTimestamp: 2, data: {} },
      },
    } as ReplayFrameEvent;
    expect(scrubRecordingEvent(span)).toBe(span);
  });
});

// Every browser error would otherwise upload a replay, and the plan allows 50
// a month.
describe("reachedErrorScreen", () => {
  it("takes a replay for an error a member saw, tagged with its reference", () => {
    expect(reachedErrorScreen({ tags: { ref: "7KQ2MX" } } as unknown as ErrorEvent)).toBe(true);
  });

  it("skips one nobody saw: a stray rejection, an extension, a chunk that failed to load", () => {
    expect(reachedErrorScreen({ tags: { replayId: "abc" } } as unknown as ErrorEvent)).toBe(false);
    expect(reachedErrorScreen({} as ErrorEvent)).toBe(false);
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

  it("scrubs every breadcrumb as it's recorded, whatever event it ends up on", () => {
    expect(sharedSentryOptions().beforeBreadcrumb).toBe(scrubBreadcrumb);
  });

  it("never sends a Drizzle query span, which would carry the values it bound", () => {
    const ignored = sharedSentryOptions().ignoreSpans;
    for (const name of ["drizzle.operation", "drizzle.execute", "drizzle.driver.execute"]) {
      expect(ignored.some((pattern) => pattern.test(name))).toBe(true);
    }
    expect(ignored.some((pattern) => pattern.test("GET /meals"))).toBe(false);
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
