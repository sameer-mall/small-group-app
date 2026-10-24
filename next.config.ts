import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { withSerwist } from "@serwist/turbopack";

// sharp's native addon loads libvips through the OS loader, not require(), so
// Next's file tracing copies the libvips package's JS but not the library
// itself. On Vercel the photo upload then fails with "libvips-cpp.so... cannot
// open shared object file". Copy it into the routes whose actions run sharp
// (src/lib/avatars.ts, via the Settings actions).
const libvips = ["./node_modules/.pnpm/@img+sharp-libvips-*/node_modules/@img/sharp-libvips-*/lib/**"];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/settings": libvips,
    "/welcome": libvips,
  },
};

export default withSentryConfig(withSerwist(nextConfig), {
  // From Vercel's environment (see .env.example). A build without them, local
  // or e2e, still works; it just uploads no source maps.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  widenClientFileUpload: true,
  silent: !process.env.CI,
  // Browser events post here, on the app's own domain, and Next forwards them
  // to Sentry. Ad blockers drop requests that go to sentry.io directly.
  tunnelRoute: "/monitoring",
});
