import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  logger: { info: vi.fn(), warn: vi.fn() },
  captureException: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => sentry);

import { logEmailSent, logRefusal, reportEmailFailure } from "./monitoring";

beforeEach(() => {
  vi.clearAllMocks();
});

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
