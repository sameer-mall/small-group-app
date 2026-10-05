import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({ init: vi.fn(), captureRequestError: vi.fn(), flush: vi.fn() }));
vi.mock("@sentry/nextjs", () => sentry);

const monitoring = vi.hoisted(() => ({ flushAfterResponse: vi.fn(), isRepeatReport: vi.fn() }));
vi.mock("@/lib/monitoring", () => monitoring);

import { onRequestError } from "./instrumentation";

describe("onRequestError", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    monitoring.isRepeatReport.mockReturnValue(false);
  });

  // On Node the SDK sends the error in the background and nothing keeps the
  // function alive for it. Next awaits this hook, so it waits for the send.
  // Next doesn't await this hook on the render path, though, so
  // `flushAfterResponse` (via `after`) covers that path separately.
  it("captures the error, schedules a flush via `after`, and finishes only once flush(2000) is sent", async () => {
    let sent!: () => void;
    sentry.flush.mockReturnValue(new Promise<boolean>((resolve) => (sent = () => resolve(true))));
    const args = [
      new Error("boom"),
      { path: "/meals", method: "GET", headers: {} },
      { routerKind: "App Router", routePath: "/meals", routeType: "render" },
    ] as Parameters<typeof onRequestError>;

    let finished = false;
    const handled = onRequestError(...args).then(() => (finished = true));
    expect(sentry.captureRequestError).toHaveBeenCalledWith(...args);
    expect(monitoring.flushAfterResponse).toHaveBeenCalledTimes(1);
    expect(sentry.flush).toHaveBeenCalledWith(2000);
    await Promise.resolve();
    expect(finished).toBe(false);

    sent();
    await handled;
    expect(finished).toBe(true);
  });

  // Next calls this hook twice for one render error that reaches the browser
  // (src/lib/monitoring.ts), both times with the same digest. The second call
  // should be dropped entirely rather than captured and flushed again.
  it("neither captures nor flushes a repeat report", async () => {
    monitoring.isRepeatReport.mockReturnValue(true);
    const args = [
      Object.assign(new Error("boom"), { digest: "123" }),
      { path: "/meals", method: "GET", headers: {} },
      { routerKind: "App Router", routePath: "/meals", routeType: "render" },
    ] as Parameters<typeof onRequestError>;

    await onRequestError(...args);

    expect(monitoring.isRepeatReport).toHaveBeenCalledWith(args[0], args[1]);
    expect(sentry.captureRequestError).not.toHaveBeenCalled();
    expect(monitoring.flushAfterResponse).not.toHaveBeenCalled();
    expect(sentry.flush).not.toHaveBeenCalled();
  });
});
