import { z } from "zod";

// Server-side environment, validated once when the module loads. Next imports
// every route while collecting page data, so a missing or malformed variable
// fails `next build` (or a cold start) with every problem listed, instead of
// surfacing later as an unrelated-looking error on the first query or sign-in.
// Holds secrets: never import this from a client component.
const envSchema = z.object({
  DATABASE_URL: z.string({ error: "Required." }),
  BETTER_AUTH_SECRET: z.string({ error: "Required." }),
  // Unset, Better Auth derives its origin from each request (and warns).
  // Previews use VERCEL_BRANCH_URL instead — see src/lib/auth.ts.
  BETTER_AUTH_URL: z
    .url({ protocol: /^https?$/, error: "Must be an http(s) URL, e.g. http://localhost:3000." })
    .optional(),
  // Injected by Vercel; unset locally and in CI.
  VERCEL_ENV: z.string().optional(),
  VERCEL_BRANCH_URL: z.string().optional(),
  VERCEL_URL: z.string().optional(),
  // Unset, Better Auth logs a warning and Google sign-in fails; email codes
  // still work, which is all local dev and CI need.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Sign-in code transport — see pickTransport in src/lib/auth-email.ts.
  AUTH_EMAIL_FILE: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  AUTH_EMAIL_FROM: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  // A blank line in .env (`GOOGLE_CLIENT_ID=`) means unset, not "".
  const set = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ""));
  const result = envSchema.safeParse(set);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const env = parseEnv(process.env);
