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
    env: {
      AUTH_EMAIL_FILE: ".e2e-mail.jsonl",
      // Pin the auth origin to the port this suite actually serves. Better
      // Auth rejects a sign-in POST whose origin doesn't match its baseURL,
      // and baseURL comes from BETTER_AUTH_URL — which a developer's
      // .env.local may point somewhere else entirely (3200 for the
      // `web-start` preview, say). Variables set here win over .env files, so
      // e2e stops depending on whatever the local env happens to say.
      BETTER_AUTH_URL: "http://localhost:3000",
      // See the matching comment in src/lib/auth.ts: `next start` runs as
      // NODE_ENV=production, which turns on Better Auth's rate limiting, and
      // the magic-link endpoint's 5-per-60s-per-IP limit doesn't have room
      // for every spec file's sign-ins from the one IP this suite runs as.
      E2E_DISABLE_AUTH_RATE_LIMIT: "1",
    },
  },
});
