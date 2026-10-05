import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { config } from "./proxy";

const runsOn = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe("proxy matcher", () => {
  // `/` is the installed app's start_url, so every launch requests it. On
  // Vercel the proxy is its own function, and a cold one adds ~0.45s in
  // front of the page. Its only job is the `?next=` path, and for `/`
  // sign-in falls back to `/` anyway.
  it("skips the home page", () => {
    expect(runsOn("/")).toBe(false);
  });

  it("runs on other pages, so their sign-in redirects keep ?next=", () => {
    expect(runsOn("/join/abc123")).toBe(true);
    expect(runsOn("/meetings/42")).toBe(true);
  });

  it("stays out of Sentry's tunnel and Next's static files", () => {
    expect(runsOn("/monitoring")).toBe(false);
    expect(runsOn("/_next/static/chunks/main.js")).toBe(false);
  });
});
