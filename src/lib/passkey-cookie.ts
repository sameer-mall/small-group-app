import { authBaseURL } from "@/lib/auth";

// Which passkey this device created, so the server can show Welcome back and
// "This iPhone". Set by a server action, not document.cookie: Safari caps
// script-written cookies at 7 days. Survives sign-out on purpose. Holds a
// passkey row id only, which is useless without the device's private key.
export const PASSKEY_COOKIE = "sg_passkey";

// Set after a passkey sign-in when the server can't tell which passkey was
// used: Welcome back still shows, but no Settings row is "This iPhone".
export const UNKNOWN_PASSKEY = "unknown";

export const passkeyCookieOptions = {
  httpOnly: true,
  secure: (authBaseURL ?? "").startsWith("https://"),
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 400, // browsers' upper limit
};
