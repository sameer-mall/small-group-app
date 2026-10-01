import { appendFileSync } from "node:fs";
import { Resend } from "resend";

// Intersected with an index signature so this isn't a TS "weak type" (all-optional):
// Next.js augments the global NodeJS.ProcessEnv with a required NODE_ENV, which
// otherwise makes `tsc` reject `pickTransport(process.env)` with TS2559 ("no
// properties in common") under `strict`.
type Env = Partial<Record<"AUTH_EMAIL_FILE" | "RESEND_API_KEY", string>> &
  Record<string, string | undefined>;

export function pickTransport(env: Env): "file" | "resend" | "console" {
  if (env.AUTH_EMAIL_FILE) return "file";
  if (env.RESEND_API_KEY) return "resend";
  return "console";
}

// The code leads the subject so it reads straight off a lock-screen
// notification, and sits alone in the body so iOS can offer it as one-time-code
// autofill above the keyboard in the installed app.
export function signInEmail(otp: string) {
  return {
    subject: `${otp} is your Small Group sign-in code`,
    text: `Your Small Group sign-in code is:\n\n${otp}\n\nIt expires in 5 minutes. If you didn't request it, ignore this email.`,
  };
}

export async function sendAuthEmail({ to, otp }: { to: string; otp: string }) {
  const mode = pickTransport(process.env);
  if (mode === "file") {
    appendFileSync(process.env.AUTH_EMAIL_FILE!, JSON.stringify({ to, otp }) + "\n");
    return;
  }
  if (mode === "resend") {
    // AUTH_EMAIL_FROM must be on a Resend-verified domain (send.sameermall.com
    // in prod). The resend.dev fallback is test mode: owner's inbox only.
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.AUTH_EMAIL_FROM ?? "Small Group <onboarding@resend.dev>",
      to,
      ...signInEmail(otp),
    });
    return;
  }
  console.log(`\n[auth email] sign-in code for ${to}: ${otp}\n`);
}
