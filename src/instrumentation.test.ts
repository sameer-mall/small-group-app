import { describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({ init: vi.fn(), captureRequestError: vi.fn(), flush: vi.fn() }));
vi.mock("@sentry/nextjs", () => sentry);

import { onRequestError } from "./instrumentation";

describe("onRequestError", () => {
  // On Node the SDK sends the error in the background and nothing keeps the
  // function alive for it. Next awaits this hook, so it waits for the send.
  it("captures the error and finishes only once it's sent", async () => {
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
    expect(sentry.flush).toHaveBeenCalledWith(2000);
    await Promise.resolve();
    expect(finished).toBe(false);

    sent();
    await handled;
    expect(finished).toBe(true);
  });
});
