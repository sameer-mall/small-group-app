import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  logger: { info: vi.fn(), warn: vi.fn() },
  captureException: vi.fn(),
  flush: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => sentry);

const nextServer = vi.hoisted(() => ({ after: vi.fn() }));
vi.mock("next/server", () => nextServer);

import { logEmailSent, logRefusal, reportEmailFailure } from "./monitoring";

beforeEach(() => {
  vi.resetAllMocks();
});

// What `after` was handed runs once the response has gone out.
function runAfterResponse() {
  for (const [task] of nextServer.after.mock.calls) task();
}

describe("logRefusal", () => {
  it("logs a domain refusal by its code", () => {
    logRefusal(new Error("session-closed"));
    expect(sentry.logger.warn).toHaveBeenCalledWith("Action refused", { reason: "session-closed" });
  });

  it("skips anything that isn't a refusal code, since real faults are captured as errors", () => {
    logRefusal(new Error('Failed query: insert into "notes" ("body") values ($1)\nparams: my private note'));
    logRefusal(new Error("Something broke"));
    logRefusal("forbidden");
    expect(sentry.logger.warn).not.toHaveBeenCalled();
    expect(nextServer.after).not.toHaveBeenCalled();
  });
});

describe("sign-in email records", () => {
  it("logs an accepted send by Resend's id only", () => {
    logEmailSent("em_123");
    expect(sentry.logger.info).toHaveBeenCalledWith("Sign-in code email sent", { resendId: "em_123" });
  });

  it("captures a failed send as an error, so it opens an issue and emails the owner", () => {
    const err = new Error("Resend refused the sign-in email: daily_quota_exceeded");
    reportEmailFailure(err);
    expect(sentry.captureException).toHaveBeenCalledWith(err, { tags: { area: "sign-in-email" } });
  });
});

// A Vercel function can go idle once its response is sent, before the SDK's
// own timer sends what it has buffered.
describe("sending records before the function goes idle", () => {
  it.each([
    ["a refusal", () => logRefusal(new Error("forbidden"))],
    ["an accepted send", () => logEmailSent("em_123")],
    ["a failed send", () => reportEmailFailure(new Error("Resend refused the sign-in email: validation_error"))],
  ])("flushes %s after the response", (_record, record) => {
    record();
    expect(nextServer.after).toHaveBeenCalledTimes(1);
    expect(sentry.flush).not.toHaveBeenCalled();
    runAfterResponse();
    expect(sentry.flush).toHaveBeenCalledWith(2000);
  });

  it("still records outside a request, where `after` throws", () => {
    nextServer.after.mockImplementation(() => {
      throw new Error("`after` was called outside a request scope.");
    });
    expect(() => logRefusal(new Error("forbidden"))).not.toThrow();
    expect(() => logEmailSent("em_123")).not.toThrow();
    expect(() => reportEmailFailure(new Error("boom"))).not.toThrow();
    expect(sentry.logger.warn).toHaveBeenCalled();
    expect(sentry.logger.info).toHaveBeenCalled();
    expect(sentry.captureException).toHaveBeenCalled();
  });
});
