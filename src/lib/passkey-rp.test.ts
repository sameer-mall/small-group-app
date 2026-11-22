import { describe, expect, it } from "vitest";
import { passkeyRpID } from "./passkey-rp";

describe("passkeyRpID", () => {
  it("uses the host of the auth base URL", () => {
    expect(passkeyRpID("https://small-group-app-beta.vercel.app")).toBe("small-group-app-beta.vercel.app");
    expect(passkeyRpID("http://localhost:3000")).toBe("localhost");
  });

  it("prefers the override, so a domain move can keep old passkeys", () => {
    expect(passkeyRpID("https://smallgroup.example.org", "small-group-app-beta.vercel.app")).toBe(
      "small-group-app-beta.vercel.app",
    );
  });
});
