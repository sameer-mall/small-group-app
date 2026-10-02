import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  /* config options here */
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
