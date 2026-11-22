"use server";

import { cookies } from "next/headers";
import { PASSKEY_COOKIE } from "@/lib/passkeys";

// The server refused this device's passkey (removed from another device):
// stop showing Welcome back here. No session needed: it only clears a cookie
// on the caller's own browser.
export async function forgetPasskeyAction(): Promise<void> {
  (await cookies()).delete(PASSKEY_COOKIE);
}
