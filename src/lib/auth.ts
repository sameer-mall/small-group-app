import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP, organization } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { sendAuthEmail } from "@/lib/auth-email";
import { env } from "@/lib/env";

// Vercel preview deployments get a fresh *.vercel.app URL per deploy, so a
// single pinned BETTER_AUTH_URL can't match them. On preview, point baseURL at
// Vercel's stable per-branch alias (VERCEL_BRANCH_URL, injected at build/run)
// so auth-built URLs resolve to the preview being tested, and trust any
// vercel.app origin so the sign-in POST from the exact preview URL isn't
// rejected as cross-origin. Production and local dev keep their fixed
// BETTER_AUTH_URL and its single implicit trusted origin.
// NOTE: Google sign-in still needs every exact URL registered in the Google
// console, so it only works on production and any stable preview URL you
// register there — not on ad-hoc preview deploys.
const isPreview = env.VERCEL_ENV === "preview";
const previewHost = env.VERCEL_BRANCH_URL ?? env.VERCEL_URL;

// The origin the app treats as its own — prod's fixed URL, or a preview's
// per-branch alias. Exported so other server code that builds absolute app
// URLs (e.g. the invite link on the group screen) resolves to the same origin
// auth does, instead of re-reading the preview-unaware BETTER_AUTH_URL.
export const authBaseURL =
  isPreview && previewHost ? `https://${previewHost}` : env.BETTER_AUTH_URL;

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  baseURL: authBaseURL,
  trustedOrigins: isPreview ? ["https://*.vercel.app"] : undefined,
  secret: env.BETTER_AUTH_SECRET,
  socialProviders: {
    // Optional (see src/lib/env.ts). Left blank, Better Auth still registers
    // the provider and logs a warning, so only Google sign-in is affected.
    google: {
      clientId: env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
  plugins: [
    organization({
      creatorRole: "admin",
      allowUserToCreateOrganization: true,
    }),
    // Emailed 6-digit codes, not magic links: a link opens in the phone's
    // browser, whose cookie jar is separate from the installed PWA's on iOS, so
    // the session landed in the browser and the home-screen app stayed signed
    // out. A code is typed into whichever app asked for it. New emails sign up
    // on first verify (no name yet — /welcome collects it).
    emailOTP({
      otpLength: 6,
      expiresIn: 300, // the email copy promises 5 minutes
      storeOTP: "hashed",
      // Per IP, per endpoint (send code / verify code). The plugin default of
      // 3/min would refuse the 4th member signing in on the same church Wi-Fi
      // at once. Guessing stays bounded by the code itself: 3 wrong tries (the
      // plugin's allowedAttempts default) or 5 minutes and it's dead.
      rateLimit: { window: 60, max: 10 },
      sendVerificationOTP: async ({ email, otp }) => {
        await sendAuthEmail({ to: email, otp });
      },
    }),
    nextCookies(), // must stay last in this array (Better Auth docs)
  ],
});
