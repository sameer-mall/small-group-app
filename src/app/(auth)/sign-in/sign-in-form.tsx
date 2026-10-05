"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const inputClass =
  "bg-card border-border focus:border-primary rounded-input min-h-tap w-full border-[1.5px] px-4 py-3.5 text-[16px] outline-none";

// Better Auth's email-OTP error codes. Expired and too-many-tries both mean the
// code is dead server-side, so both point at "Send a new code".
const CODE_ERRORS: Record<string, string> = {
  INVALID_OTP: "That code doesn't match. Check the email and try again.",
  OTP_EXPIRED: "That code has expired. Send a new one.",
  TOO_MANY_ATTEMPTS: "Too many tries. Send a new code.",
};

export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [pending, setPending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setPending(true);
    setError(null);
    setResent(false);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
    setPending(false);
    if (error) setError("Couldn't send the code. Check the address and try again.");
    else setOtp("");
    return !error;
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (await sendCode()) setStep("code");
  }

  async function resendCode() {
    if (await sendCode()) setResent(true);
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setResent(false);
    const { data, error } = await authClient.signIn.emailOtp({ email, otp });
    if (error || !data) {
      setPending(false);
      setError(CODE_ERRORS[error?.code ?? ""] ?? "Couldn't sign you in. Try again.");
      return;
    }
    // Stay pending through the navigation so the button can't double-submit.
    // A first-time email has no name yet: /welcome collects it, then forwards.
    router.push(data.user.name.trim() ? next : `/welcome?next=${encodeURIComponent(next)}`);
  }

  async function signInWithGoogle() {
    setError(null);
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL: next });
    if (error) setError("Couldn't sign in with Google. Try again.");
  }

  if (step === "code")
    return (
      <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
        <form onSubmit={verifyCode} className="flex flex-col gap-3">
          <div className="mb-1 text-center">
            <h2 className="font-serif text-xl font-semibold">Check your email</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              We sent a 6-digit code to <span className="text-strong font-medium">{email}</span>.
              It expires in 5 minutes.
            </p>
          </div>
          <label className="text-strong text-sm font-medium" htmlFor="otp">
            Sign-in code
          </label>
          <input
            id="otp"
            required
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            className={`${inputClass} text-center font-semibold tracking-[0.4em] tabular-nums`}
          />
          <Button type="submit" size="block" disabled={pending || otp.length !== 6}>
            Sign in
          </Button>
        </form>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={resendCode}
            disabled={pending}
            className="flex-1"
          >
            Send a new code
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setStep("email");
              setError(null);
              setResent(false);
            }}
            disabled={pending}
            className="flex-1"
          >
            Use a different email
          </Button>
        </div>
        {resent && <p className="text-muted-foreground text-center text-sm">New code sent.</p>}
        {error && <p className="text-destructive text-center text-sm">{error}</p>}
      </div>
    );

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <form onSubmit={submitEmail} className="flex flex-col gap-3">
        <label className="text-strong text-sm font-medium" htmlFor="email">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={inputClass}
        />
        <Button type="submit" size="block" disabled={pending}>
          Email me a code
        </Button>
        <p className="text-tertiary text-center text-xs">
          No password needed. We&apos;ll email you a 6-digit code.
        </p>
      </form>
      <div className="text-muted-foreground flex items-center gap-3 text-xs">
        <div className="bg-divider h-px flex-1" /> or <div className="bg-divider h-px flex-1" />
      </div>
      <Button variant="outline" size="block" onClick={signInWithGoogle}>
        Continue with Google
      </Button>
      {error && <p className="text-destructive text-center text-sm">{error}</p>}
    </div>
  );
}
