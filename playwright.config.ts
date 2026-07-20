import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "pnpm next start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    env: { AUTH_EMAIL_FILE: ".e2e-mail.jsonl" },
  },
});
