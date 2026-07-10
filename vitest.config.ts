import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Vite 8's native tsconfig-paths support — intentional replacement for the
    // vite-tsconfig-paths plugin (deprecated for Vite 8) named in the original plan.
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
    globalSetup: ["tests/integration/global-setup.ts"],
    setupFiles: ["dotenv/config"],
    env: {
      // Silence dotenv's "injecting env" info line so test output stays pristine.
      DOTENV_CONFIG_QUIET: "true",
    },
  },
});
