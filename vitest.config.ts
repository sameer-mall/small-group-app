import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
    setupFiles: ["dotenv/config"],
    env: {
      // Silence dotenv's "injecting env" info line so test output stays pristine.
      DOTENV_CONFIG_QUIET: "true",
    },
  },
});
