"use server";

import { cookies, headers } from "next/headers";
import { getSession } from "@/lib/dal";
import { PASSKEY_COOKIE, UNKNOWN_PASSKEY, passkeyCookieOptions } from "@/lib/passkey-cookie";
import { passkeyMethod } from "@/lib/passkey-device";
import { passkeyForDevice } from "@/lib/passkeys";

// The server refused this device's passkey (removed from another device):
// stop showing Welcome back here. No session needed: it only clears a cookie
// on the caller's own browser.
export async function forgetPasskeyAction(): Promise<void> {
  (await cookies()).delete(PASSKEY_COOKIE);
}

// After a sign-in from the email field's passkey suggestion. The cookie was
// lost (site data cleared, app re-added) but the passkey wasn't: set it again
// so Welcome back returns from the next visit. Needs the session the sign-in
// just created; does nothing without one.
export async function rememberSignedInPasskeyAction(): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const userAgent = (await headers()).get("user-agent") ?? "";
  const id = await passkeyForDevice(session.user.id, passkeyMethod(userAgent).deviceName);
  (await cookies()).set(PASSKEY_COOKIE, id ?? UNKNOWN_PASSKEY, passkeyCookieOptions);
}
