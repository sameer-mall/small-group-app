import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // e2e/auth-groups.spec.ts drives two complete magic-link sign-ins and five
  // post-server-action assertions that may each wait up to 10s — roughly twenty
  // sequential round trips against a cold `next start` and an empty database.
  // Playwright's 30s default budget covers the whole test, so on a loaded CI
  // runner it can expire mid-flow and blame whichever locator happened to be in
  // flight rather than the real cause. Size the budget to the work instead.
  timeout: 90_000,
  use: {
    baseURL: "http://localhost:3000",
    // A cumulative-timeout failure is near-undiagnosable from console output
    // alone (it names the in-flight step, not the slow one). Keep a trace.
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm next start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    env: { AUTH_EMAIL_FILE: ".e2e-mail.jsonl" },
  },
});
