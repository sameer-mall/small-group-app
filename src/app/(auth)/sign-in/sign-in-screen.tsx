"use client";

import { useState, useSyncExternalStore } from "react";
import { passkeyCopy, passkeySupported, type PasskeyMethod } from "@/lib/passkey-device";
import { SignInForm } from "./sign-in-form";
import { WelcomeBack } from "./welcome-back";

const noSubscribe = () => () => {};

// A device that created a passkey (the sg_passkey cookie) opens to Welcome
// back; every other device sees the form. A browser without WebAuthn always
// gets the form. The server renders as if supported, and the rare browser
// that isn't switches after hydration.
export function SignInScreen({
  next,
  method,
  hasPasskey,
}: {
  next: string;
  method: PasskeyMethod;
  hasPasskey: boolean;
}) {
  const supported = useSyncExternalStore(noSubscribe, passkeySupported, () => true);
  const [useEmail, setUseEmail] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const welcome = hasPasskey && supported && !useEmail;

  return (
    <>
      <div className="text-center">
        <h1 className="font-serif text-3xl font-semibold">Small Group</h1>
        <p className="text-muted-foreground mt-2">
          {welcome ? "Welcome back." : "Meals, prayer, and notes for our weekly small group."}
        </p>
      </div>
      {welcome ? (
        <WelcomeBack
          next={next}
          method={method}
          onUseEmail={() => setUseEmail(true)}
          onRemoved={() => {
            setNotice(passkeyCopy(method).removedNotice);
            setUseEmail(true);
          }}
        />
      ) : (
        <SignInForm next={next} notice={notice} />
      )}
    </>
  );
}
