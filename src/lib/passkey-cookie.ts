import { authBaseURL } from "@/lib/auth";
import { PASSKEY_COOKIE, UNKNOWN_PASSKEY } from "@/lib/passkey-device";

// The sg_passkey cookie (names in passkey-device.ts, which the browser can
// import). Set by a server action, not document.cookie: Safari caps
// script-written cookies at 7 days. Survives sign-out on purpose. Holds a
// passkey row id only, which is useless without the device's private key.
export { PASSKEY_COOKIE, UNKNOWN_PASSKEY };

export const passkeyCookieOptions = {
  httpOnly: true,
  secure: (authBaseURL ?? "").startsWith("https://"),
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 400, // browsers' upper limit
};
