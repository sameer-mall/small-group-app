// Passkey wording and device state. Pure and browser-safe (no zod, no server
// imports): the server picks wording from the user agent, and client
// components use the browser checks and storage helpers.
// Spec: docs/superpowers/specs/2026-11-15-passkeys-design.md

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

// Per-kind wording. `feature` is the name in a sentence: Face ID is a proper
// noun, so it keeps its capitals. `unlocks` names the device for fingerprint
// (a tablet is not a phone); Face ID is always an iPhone.
const NAMES: Record<
  PasskeyKind,
  { title: string; feature: string; with: string; explainer: string; unlocks: (device: string) => string }
> = {
  "face-id": {
    title: "Face ID",
    feature: "Face ID",
    with: "Face ID",
    explainer: "Sign in with a glance instead of waiting for an email code.",
    unlocks: () => "Your face unlocks Small Group on this phone.",
  },
  fingerprint: {
    title: "Fingerprint sign-in",
    feature: "fingerprint sign-in",
    with: "fingerprint",
    explainer: "Sign in with your fingerprint instead of waiting for an email code.",
    unlocks: (device) => `Your fingerprint unlocks Small Group on this ${device}.`,
  },
  passkey: {
    title: "Passkey sign-in",
    feature: "passkey sign-in",
    with: "a passkey",
    explainer: "Sign in with your device's screen lock instead of waiting for an email code.",
    unlocks: () => "Your device's screen lock signs you in.",
  },
};

export function passkeyCopy(method: PasskeyMethod) {
  const n = NAMES[method.kind];
  const turnOn = `Turn on ${n.feature}`;
  return {
    signInButton: `Sign in with ${n.with}`,
    signInFailed: `Couldn't sign in with ${n.with}. Try again, or use email instead.`,
    cardTitle: method.kind === "passkey" ? "Passkeys" : n.title,
    explainer: n.explainer,
    turnOn,
    turnOnHere: `${turnOn} for this ${method.device}`,
    turnOnFailed: `Couldn't turn on ${n.feature}. Try again from Settings.`,
    offerTitle: `Sign in with ${method.kind === "fingerprint" ? "your fingerprint" : n.with} next time?`,
    offerBody: `Skip the email code. ${n.unlocks(method.device)}`,
    removedNotice: `${n.title} was turned off for this ${method.device}. Sign in with an email code, then you can turn it back on in Settings.`,
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

// Storage can be missing (the server) or throw on access (Safari with site
// data blocked): either way, undefined.
function safely(get: () => Storage): Store | undefined {
  try {
    return get();
  } catch {
    return undefined;
  }
}

const local = () => safely(() => window.localStorage);
const session = () => safely(() => window.sessionStorage);

// Storage that throws or is missing counts as "already offered": better to
// skip the sheet than to show it on every sign-in.
export function wasOffered(store = local()): boolean {
  if (!store) return true;
  try {
    return store.getItem(OFFERED) === "1";
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
