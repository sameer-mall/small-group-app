import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));
const monitoring = vi.hoisted(() => ({ logEmailSent: vi.fn(), reportEmailFailure: vi.fn() }));
vi.mock("@/lib/monitoring", () => monitoring);
// Only RESEND_API_KEY set, so sendAuthEmail takes the Resend path. The
// pickTransport tests pass their own values and never read this.
vi.mock("@/lib/env", () => ({ env: { RESEND_API_KEY: "re_test" } }));

import { pickTransport, sendAuthEmail, signInEmail } from "./auth-email";

describe("pickTransport", () => {
  it("uses file transport when AUTH_EMAIL_FILE is set (e2e)", () => {
    expect(pickTransport({ AUTH_EMAIL_FILE: "/tmp/mail.jsonl", RESEND_API_KEY: "x" })).toBe("file");
  });
  it("uses resend when only RESEND_API_KEY is set", () => {
    expect(pickTransport({ RESEND_API_KEY: "re_123" })).toBe("resend");
  });
  it("falls back to console for local dev", () => {
    expect(pickTransport({})).toBe("console");
  });
});

describe("signInEmail", () => {
  it("leads the subject with the code so it reads from a notification", () => {
    expect(signInEmail("482913").subject).toMatch(/^482913 /);
  });
  it("puts the code in the body with its expiry", () => {
    const { text } = signInEmail("482913");
    expect(text).toContain("482913");
    expect(text).toContain("5 minutes");
  });
  it("never mentions a link — the code is typed into the app", () => {
    const { subject, text } = signInEmail("482913");
    expect(`${subject} ${text}`).not.toMatch(/https?:\/\/|link/i);
  });
});

describe("sendAuthEmail through Resend", () => {
  const message = { to: "ruth@example.com", otp: "482913" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs Resend's id when the email is accepted", async () => {
    send.mockResolvedValue({ data: { id: "em_123" }, error: null, headers: null });
    await sendAuthEmail(message);
    expect(monitoring.logEmailSent).toHaveBeenCalledWith("em_123");
    expect(monitoring.reportEmailFailure).not.toHaveBeenCalled();
  });

  it("reports and throws when Resend refuses, which it says by returning an error, not throwing", async () => {
    send.mockResolvedValue({
      data: null,
      // Resend's message can echo the address back; only its name may leave.
      error: { name: "validation_error", message: "Invalid `to`: ruth@example.com", statusCode: 422 },
      headers: null,
    });
    await expect(sendAuthEmail(message)).rejects.toThrow(
      "Resend refused the sign-in email: validation_error",
    );
    expect(monitoring.reportEmailFailure).toHaveBeenCalledOnce();
    const [reported] = monitoring.reportEmailFailure.mock.calls[0];
    expect(String(reported)).not.toContain("ruth@example.com");
    expect(String(reported)).not.toContain("482913");
    expect(monitoring.logEmailSent).not.toHaveBeenCalled();
  });

  it("reports and rethrows when the request to Resend fails outright", async () => {
    send.mockRejectedValue(new Error("fetch failed"));
    await expect(sendAuthEmail(message)).rejects.toThrow("fetch failed");
    expect(monitoring.reportEmailFailure).toHaveBeenCalledOnce();
  });
});
