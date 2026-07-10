import { describe, expect, it } from "vitest";
import { pickTransport } from "./auth-email";

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
