"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PasskeyIcon } from "@/components/passkey-icon";
import { authClient, UNREACHABLE_MESSAGE } from "@/lib/auth-client";
import { passkeyCopy, passkeyErrorKind, type PasskeyMethod } from "@/lib/passkey-device";
import { forgetPasskeyAction } from "./actions";

// Never prompts on its own: a sheet that pops up unasked is easy to dismiss by
// accident, so the member taps the button (spec, "Sign-in screen").
export function WelcomeBack({
  next,
  method,
  onUseEmail,
  onRemoved,
}: {
  next: string;
  method: PasskeyMethod;
  onUseEmail: () => void;
  onRemoved: () => void;
}) {
  const router = useRouter();
  const copy = passkeyCopy(method);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    try {
      const { error } = await authClient.signIn.passkey();
      if (!error) {
        // Stay pending through the navigation. requireUser sends a nameless
        // account to /welcome, as after a code sign-in.
        router.push(next);
        return;
      }
      setPending(false);
      const kind = passkeyErrorKind(error);
      if (kind === "cancelled") return;
      if (kind === "removed") {
        await forgetPasskeyAction();
        onRemoved();
        return;
      }
      setError(copy.signInFailed);
    } catch {
      setPending(false);
      setError(UNREACHABLE_MESSAGE);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
      <div className="bg-surface-tint text-accent-strong mx-auto flex size-18 items-center justify-center rounded-full">
        <PasskeyIcon kind={method.kind} className="size-9" strokeWidth={1.75} />
      </div>
      <div className="flex flex-col gap-3">
        <Button size="block" onClick={signIn} disabled={pending}>
          <PasskeyIcon kind={method.kind} className="size-5" />
          {copy.signInButton}
        </Button>
        <Button variant="outline" size="block" onClick={onUseEmail} disabled={pending}>
          Use email instead
        </Button>
        {error && <p className="text-destructive text-center text-sm">{error}</p>}
      </div>
    </div>
  );
}
