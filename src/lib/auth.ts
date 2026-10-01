import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, organization } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { sendAuthEmail } from "@/lib/auth-email";

// Vercel preview deployments get a fresh *.vercel.app URL per deploy, so a
// single pinned BETTER_AUTH_URL can't match them. On preview, point baseURL at
// Vercel's stable per-branch alias (VERCEL_BRANCH_URL, injected at build/run)
// so magic-link URLs resolve to the preview being tested, and trust any
// vercel.app origin so the sign-in POST from the exact preview URL isn't
// rejected as cross-origin. Production and local dev keep their fixed
// BETTER_AUTH_URL and its single implicit trusted origin.
// NOTE: Google sign-in still needs every exact URL registered in the Google
// console, so it only works on production and any stable preview URL you
// register there — not on ad-hoc preview deploys.
const isPreview = process.env.VERCEL_ENV === "preview";
const previewHost = process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL;

// The origin the app treats as its own — prod's fixed URL, or a preview's
// per-branch alias. Exported so other server code that builds absolute app
// URLs (e.g. the invite link on the group screen) resolves to the same origin
// auth does, instead of re-reading the preview-unaware BETTER_AUTH_URL.
export const authBaseURL =
  isPreview && previewHost ? `https://${previewHost}` : process.env.BETTER_AUTH_URL;

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  baseURL: authBaseURL,
  trustedOrigins: isPreview ? ["https://*.vercel.app"] : undefined,
  secret: process.env.BETTER_AUTH_SECRET,
  // Better Auth turns rate limiting on whenever NODE_ENV is "production" —
  // which `next start` always is, including under the Playwright suite. The
  // magic-link endpoint's own limit (5 sign-ins per 60s, keyed by IP) easily
  // covers real traffic, but every e2e spec signs in from the same localhost
  // IP, so the whole suite's sign-ins share one bucket and the count now
  // exceeds it. Disabled only via the e2e-only env var set in
  // playwright.config.ts's webServer.env; production keeps rate limiting on.
  rateLimit: process.env.E2E_DISABLE_AUTH_RATE_LIMIT ? { enabled: false } : undefined,
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  plugins: [
    organization({
      creatorRole: "admin",
      allowUserToCreateOrganization: true,
    }),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendAuthEmail({ to: email, url });
      },
    }),
    nextCookies(), // must stay last in this array (Better Auth docs)
  ],
});
