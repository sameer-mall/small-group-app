import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient, UNREACHABLE_MESSAGE } from "@/lib/auth-client";
import { passkeyCopy, passkeyErrorKind, type PasskeyMethod } from "@/lib/passkey-device";

// Creates this device's passkey: the offer sheet and the Settings card both
// turn it on this way. Always a platform passkey, named for the device. The
// registration response also sets the "this device" cookie (the after hook in
// src/lib/auth.ts), so a refresh is all that's left.
//
// "already": the browser refused because this device holds a passkey for the
// member (synced from another device, or the cookie was cleared). Nothing to
// create; the next sign-in with it sets the cookie, so say that instead.
export function useTurnOnPasskey(method: PasskeyMethod) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function turnOn(): Promise<"added" | "already" | "cancelled" | "failed"> {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const { data, error } = await authClient.passkey.addPasskey({
        name: method.deviceName,
        authenticatorAttachment: "platform",
      });
      if (data && !error) {
        router.refresh();
        return "added";
      }
      const kind = passkeyErrorKind(error);
      if (kind === "cancelled") return "cancelled";
      if (kind === "already") {
        setNotice(passkeyCopy(method).alreadyOn);
        return "already";
      }
      setError(passkeyCopy(method).turnOnFailed);
      return "failed";
    } catch {
      setError(UNREACHABLE_MESSAGE);
      return "failed";
    } finally {
      setPending(false);
    }
  }

  return { turnOn, pending, error, notice };
}
