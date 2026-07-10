"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignInForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: next,
      newUserCallbackURL: `/welcome?next=${encodeURIComponent(next)}`,
    });
    if (error) setError("Couldn't send the link. Check the address and try again.");
    else setSent(true);
  }

  if (sent)
    return (
      <div className="bg-card rounded-card shadow-card mx-auto w-full max-w-sm p-6 text-center">
        <h2 className="font-serif text-xl font-semibold">Check your email</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          We sent a sign-in link to {email}. It expires in 5 minutes.
        </p>
      </div>
    );

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <form onSubmit={sendLink} className="flex flex-col gap-3">
        <label className="text-strong text-sm font-medium" htmlFor="email">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="bg-card border-border focus:border-primary rounded-input min-h-tap w-full border-[1.5px] px-4 py-3.5 text-[16px] outline-none"
        />
        <Button type="submit" size="lg" className="min-h-tap w-full font-bold">
          Send magic link
        </Button>
        <p className="text-tertiary text-xs text-center">
          No password needed. We&apos;ll email you a secure link.
        </p>
        {error && <p className="text-destructive text-sm text-center">{error}</p>}
      </form>
      <div className="text-muted-foreground flex items-center gap-3 text-xs">
        <div className="bg-divider h-px flex-1" /> or <div className="bg-divider h-px flex-1" />
      </div>
      <Button
        variant="outline"
        size="lg"
        className="min-h-tap w-full"
        onClick={() => authClient.signIn.social({ provider: "google", callbackURL: next })}
      >
        Continue with Google
      </Button>
    </div>
  );
}
