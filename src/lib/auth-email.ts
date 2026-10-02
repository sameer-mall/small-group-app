import { appendFileSync } from "node:fs";
import { Resend } from "resend";
import { env, type Env } from "@/lib/env";
import { logEmailSent, reportEmailFailure } from "@/lib/monitoring";

export function pickTransport({
  AUTH_EMAIL_FILE,
  RESEND_API_KEY,
}: Pick<Env, "AUTH_EMAIL_FILE" | "RESEND_API_KEY">): "file" | "resend" | "console" {
  if (AUTH_EMAIL_FILE) return "file";
  if (RESEND_API_KEY) return "resend";
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
  const mode = pickTransport(env);
  if (mode === "file") {
    appendFileSync(env.AUTH_EMAIL_FILE!, JSON.stringify({ to, otp }) + "\n");
    return;
  }
  if (mode === "resend") {
    // AUTH_EMAIL_FROM must be on a Resend-verified domain (send.sameermall.com
    // in prod). The resend.dev fallback is test mode: owner's inbox only.
    const resend = new Resend(env.RESEND_API_KEY);
    try {
      const result = await resend.emails.send({
        from: env.AUTH_EMAIL_FROM ?? "Small Group <onboarding@resend.dev>",
        to,
        ...signInEmail(otp),
      });
      // Resend reports a refused send (quota, rate limit, unverified sender)
      // in its return value; it doesn't throw. Its message can echo the
      // address back, so only the error's name goes into ours.
      if (result.error) throw new Error(`Resend refused the sign-in email: ${result.error.name}`);
      logEmailSent(result.data.id);
    } catch (err) {
      // Better Auth catches whatever this throws and only console-logs it, and
      // the sign-in screen still says the code is on its way. Reporting here is
      // how anyone finds out.
      reportEmailFailure(err);
      throw err;
    }
    return;
  }
  console.log(`\n[auth email] sign-in code for ${to}: ${otp}\n`);
}
