import { describe, expect, it } from "vitest";
import { pickTransport, signInEmail } from "./auth-email";

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
