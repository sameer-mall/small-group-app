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

export async function sendAuthEmail({ to, url }: { to: string; url: string }) {
  const mode = pickTransport(process.env);
  if (mode === "file") {
    appendFileSync(process.env.AUTH_EMAIL_FILE!, JSON.stringify({ to, url }) + "\n");
    return;
  }
  if (mode === "resend") {
    // AUTH_EMAIL_FROM must be on a Resend-verified domain (send.sameermall.com
    // in prod). The resend.dev fallback is test mode: owner's inbox only.
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.AUTH_EMAIL_FROM ?? "Small Group <onboarding@resend.dev>",
      to,
      subject: "Your sign-in link",
      text: `Sign in to Small Group: ${url}\n\nThis link expires in 5 minutes. If you didn't request it, ignore this email.`,
    });
    return;
  }
  console.log(`\n[auth email] magic link for ${to}:\n${url}\n`);
}
