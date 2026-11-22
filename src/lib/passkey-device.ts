// Passkey wording and device state. Pure and browser-safe (no zod, no server
// imports): the server picks wording from the user agent, and client
// components use the browser checks and storage helpers.
// Spec: docs/superpowers/specs/2026-11-15-passkeys-design.md

// Which passkey this device created, so the server can show Welcome back and
// "This iPhone". Here rather than in passkey-cookie.ts so client components can
// read the names too.
export const PASSKEY_COOKIE = "sg_passkey";

// Set after a passkey sign-in when the server can't tell which passkey was
// used: Welcome back still shows, but no Settings row is "This iPhone".
export const UNKNOWN_PASSKEY = "unknown";

export type PasskeyKind = "face-id" | "fingerprint" | "passkey";

export type PasskeyMethod = {
  kind: PasskeyKind;
  // Names a new passkey. Members can't rename them.
  deviceName: string;
  // Labels the passkey this device created in Settings.
  thisDevice: string;
  device: "phone" | "tablet" | "device";
};

// A wrong guess only mislabels the button: the OS shows its own prompt.
// iPadOS Safari sends a Mac user agent, so an iPad reads as a Mac.
export function passkeyMethod(userAgent: string): PasskeyMethod {
  if (/iPhone/.test(userAgent)) {
    return { kind: "face-id", deviceName: "iPhone", thisDevice: "This iPhone", device: "phone" };
  }
  if (/Android/.test(userAgent)) {
    return /Mobile/.test(userAgent)
      ? { kind: "fingerprint", deviceName: "Android phone", thisDevice: "This phone", device: "phone" }
      : { kind: "fingerprint", deviceName: "Android tablet", thisDevice: "This tablet", device: "tablet" };
  }
  if (/Macintosh/.test(userAgent)) {
    return { kind: "passkey", deviceName: "Mac", thisDevice: "This Mac", device: "device" };
  }
  return { kind: "passkey", deviceName: "Computer", thisDevice: "This computer", device: "device" };
}

export function kindForDeviceName(name: string | null): PasskeyKind {
  if (name === "iPhone") return "face-id";
  if (name?.startsWith("Android")) return "fingerprint";
  return "passkey";
}

const NAMES: Record<PasskeyKind, { feature: string; with: string; unlocks: string }> = {
  "face-id": { feature: "Face ID", with: "Face ID", unlocks: "Your face unlocks Small Group on this phone." },
  fingerprint: { feature: "Fingerprint sign-in", with: "fingerprint", unlocks: "" },
  passkey: { feature: "Passkey sign-in", with: "a passkey", unlocks: "Your device's screen lock signs you in." },
};

export type PasskeyCopy = ReturnType<typeof passkeyCopy>;

export function passkeyCopy(method: PasskeyMethod) {
  const n = NAMES[method.kind];
  // Face ID is a proper noun: keep it capitalized wherever the feature name appears.
  const featureLower = method.kind === "face-id" ? "Face ID" : n.feature.toLowerCase();
  // The fingerprint line names the device: a tablet is not a phone.
  const unlocks =
    method.kind === "fingerprint"
      ? `Your fingerprint unlocks Small Group on this ${method.device}.`
      : n.unlocks;
  const turnOn = method.kind === "face-id" ? "Turn on Face ID" : `Turn on ${featureLower}`;
  return {
    signInButton: `Sign in with ${n.with}`,
    signInFailed: `Couldn't sign in with ${n.with}. Try again, or use email instead.`,
    cardTitle: method.kind === "passkey" ? "Passkeys" : n.feature,
    explainer:
      method.kind === "face-id"
        ? "Sign in with a glance instead of waiting for an email code."
        : method.kind === "fingerprint"
          ? "Sign in with your fingerprint instead of waiting for an email code."
          : "Sign in with your device's screen lock instead of waiting for an email code.",
    turnOn,
    turnOnHere: `${turnOn} for this ${method.device}`,
    turnOnFailed: `Couldn't turn on ${featureLower}. Try again from Settings.`,
    offerTitle: `Sign in with ${method.kind === "fingerprint" ? "your fingerprint" : n.with} next time?`,
    offerBody: `Skip the email code. ${unlocks}`,
    removedNotice: `${n.feature} was turned off for this ${method.device}. Sign in with an email code, then you can turn it back on in Settings.`,
  };
}

// Better Auth's passkey client returns `{ error: { code, message } }`.
// Cancelling the OS sheet surfaces as AUTH_CANCELLED on sign-in and a
// ceremony-aborted or NotAllowedError on registration. iOS also reports "no
// passkey for this site" as NotAllowedError, which is why a device without one
// never shows the button.
export function passkeyErrorKind(
  error: { code?: string; message?: string } | null | undefined,
): "cancelled" | "removed" | "other" {
  if (!error) return "other";
  if (error.code === "PASSKEY_NOT_FOUND") return "removed";
  if (
    error.code === "AUTH_CANCELLED" ||
    error.code === "ERROR_CEREMONY_ABORTED" ||
    /NotAllowedError|AbortError/.test(error.message ?? "")
  ) {
    return "cancelled";
  }
  return "other";
}

export function passkeySupported(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential === "function";
}

export async function platformPasskeyAvailable(): Promise<boolean> {
  try {
    return passkeySupported() && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

export async function conditionalMediationAvailable(): Promise<boolean> {
  try {
    return passkeySupported() && (await PublicKeyCredential.isConditionalMediationAvailable?.()) === true;
  } catch {
    return false;
  }
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const OFFERED = "sg:passkey-offered";
const JUST_SIGNED_IN = "sg:just-signed-in";

function local(): Store | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function session(): Store | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

// Storage that throws or is missing counts as "already offered": better to
// skip the sheet than to show it on every sign-in.
export function wasOffered(store = local()): boolean {
  if (!store) return true;
  try {
    return store?.getItem(OFFERED) === "1";
  } catch {
    return true;
  }
}

export function markOffered(store = local()) {
  try {
    store?.setItem(OFFERED, "1");
  } catch {}
}

// Left by the sign-in form after a code or Google sign-in; read by the offer
// sheet on the first (app) screen. sessionStorage, so it survives the Google
// redirect in the same tab and nothing else.
export function noteJustSignedIn(store = session()) {
  try {
    store?.setItem(JUST_SIGNED_IN, "1");
  } catch {}
}

export function hasJustSignedIn(store = session()): boolean {
  try {
    return store?.getItem(JUST_SIGNED_IN) === "1";
  } catch {
    return false;
  }
}

export function takeJustSignedIn(store = session()): boolean {
  const had = hasJustSignedIn(store);
  try {
    store?.removeItem(JUST_SIGNED_IN);
  } catch {}
  return had;
}

// "Nov 15", in UTC (as formatMeetingDate in src/lib/utils.ts), so the server
// and the browser print the same date and hydration matches.
export function addedLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
