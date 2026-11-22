import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { passkey } from "@better-auth/passkey";
import { emailOTP, organization } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { sendAuthEmail } from "@/lib/auth-email";
import { env } from "@/lib/env";
import { largeGooglePhoto } from "@/lib/google-photo";
import { passkeyRpID } from "@/lib/passkey-rp";
import { PASSKEY_COOKIE, passkeyIdForCredential } from "@/lib/passkeys";
import { LATEST_RELEASE_ID } from "@/lib/whats-new";

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

const passkeyCookieOptions = {
  httpOnly: true,
  secure: (authBaseURL ?? "").startsWith("https://"),
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 400, // browsers' upper limit
} as const;

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  baseURL: authBaseURL,
  trustedOrigins: isPreview ? ["https://*.vercel.app"] : undefined,
  secret: env.BETTER_AUTH_SECRET,
  // The passkey plugin's list, rename, and delete endpoints. The app lists and
  // removes passkeys through src/lib/passkeys.ts instead: the plugin's list
  // returns the public key, and members can't rename passkeys (spec).
  disabledPaths: ["/passkey/list-user-passkeys", "/passkey/update-passkey", "/passkey/delete-passkey"],
  user: {
    additionalFields: {
      // The highest What's new entry this member has dismissed (see
      // src/lib/whats-new.ts). Sessions read the user row on every request, so
      // the (app) layout gets it with no extra query. input: false keeps
      // clients from setting it through Better Auth's own endpoints; only
      // markWhatsNewSeen writes it. The SQL default of 0 is what existing
      // members got when the column was added: they see every entry once.
      whatsNewSeen: {
        type: "number",
        required: true,
        input: false,
        defaultValue: 0,
      },
    },
  },
  hooks: {
    // Better Auth's own /update-user endpoint accepts `image` from the
    // browser, which would let any member point their avatar at any URL and
    // have every other member's browser load it. Photos only come through
    // saveAvatar (src/lib/avatars.ts), which writes the row directly. Google
    // sign-up sets the image through createOAuthUser, not this endpoint.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/update-user" && ctx.body && "image" in ctx.body) {
        throw new APIError("BAD_REQUEST", { message: "Photos are changed from Settings." });
      }
    }),
    // Remember which passkey this device holds (PASSKEY_COOKIE), set where the
    // exact credential is known: a registration (always a platform passkey,
    // src/components/use-turn-on-passkey.ts) or a sign-in with a platform
    // passkey. A sign-in through another device's QR code is cross-platform:
    // that passkey lives on the phone, so the laptop isn't told it holds one.
    after: createAuthMiddleware(async (ctx) => {
      const returned = ctx.context.returned as Record<string, unknown> | undefined;
      let id: string | null = null;
      if (ctx.path === "/passkey/verify-registration" && typeof returned?.credentialID === "string") {
        id = typeof returned.id === "string" ? returned.id : null;
      } else if (ctx.path === "/passkey/verify-authentication" && returned?.session) {
        const response = ctx.body?.response as { id?: unknown; authenticatorAttachment?: unknown } | undefined;
        if (response?.authenticatorAttachment === "platform" && typeof response.id === "string") {
          id = await passkeyIdForCredential(response.id);
        }
      }
      if (id) ctx.setCookie(PASSKEY_COOKIE, id, passkeyCookieOptions);
    }),
  },
  databaseHooks: {
    user: {
      create: {
        // New members start caught up: no backlog of changes from before they
        // joined. Every sign-up path (emailed code, Google) comes through here.
        before: async (newUser) => ({ data: { ...newUser, whatsNewSeen: LATEST_RELEASE_ID } }),
      },
    },
  },
  socialProviders: {
    // Optional (see src/lib/env.ts). Left blank, Better Auth still registers
    // the provider and logs a warning, so only Google sign-in is affected.
    google: {
      clientId: env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
      // Google's picture URL asks for 96px; store a large copy instead.
      mapProfileToUser: (profile) => ({ image: largeGooglePhoto(profile.picture) }),
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
    // Face ID, fingerprint, or another platform passkey (spec:
    // 2026-11-15-passkeys-design.md). Discoverable credentials with user
    // verification required, so sign-in needs no email and always checks the
    // face, finger, or device PIN. Listing and removing go through
    // src/lib/passkeys.ts instead of the plugin's endpoints.
    passkey({
      rpID: passkeyRpID(authBaseURL ?? "http://localhost:3000", env.PASSKEY_RP_ID),
      rpName: "Small Group",
      // SimpleWebAuthn compares origins as exact strings, so drop any trailing
      // slash or path a BETTER_AUTH_URL might carry.
      origin: authBaseURL ? new URL(authBaseURL).origin : undefined,
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      // The plugin requires a "fresh" session (Better Auth's 24 hours) to
      // register, and members turn on Face ID from Settings on sessions days
      // old. Without requireSession it still needs a signed-in member: with no
      // session and no resolveUser, generating options is refused. Scoped to
      // passkeys, so every other fresh-session check stays on.
      registration: { requireSession: false },
    }),
    nextCookies(), // must stay last in this array (Better Auth docs)
  ],
});
