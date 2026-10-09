// What the Settings > Notifications card shows, from three facts the browser
// can report. Pure, so the decision is unit tested without a browser.
// Browser-shipped: no zod, no db.
export type CardState = "unsupported" | "blocked" | "on" | "off";

export function cardState(i: {
  supported: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
}): CardState {
  if (!i.supported) return "unsupported";
  if (i.permission === "denied") return "blocked";
  return i.subscribed ? "on" : "off";
}

// Whether to show the first-launch "turn on notifications" dialog
// (notification-prompt-dialog.tsx). Only to an installed app whose member has
// not yet answered the question in any way, and never while What's new has
// their attention. `remembered` is this device's localStorage record, if any.
export const PROMPT_STORAGE_KEY = "small-group:notification-prompt";

export function shouldPromptForNotifications(i: {
  supported: boolean;
  standalone: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
  remembered: string | null;
  deferred: boolean;
}): boolean {
  if (!i.supported || !i.standalone) return false;
  if (i.permission !== "default") return false;
  if (i.subscribed) return false;
  if (i.remembered !== null) return false;
  if (i.deferred) return false;
  return true;
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches;
}

// iOS delivers Web Push only to Home Screen apps, never to a Safari tab, and
// does not expose PushManager outside one. Checked both ways to be sure.
export function pushSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return false;
  }
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (!isIOS) return true;
  return isStandalone();
}

// pushManager.subscribe wants the VAPID public key as bytes; the env var is
// the base64url string web-push generated.
export function urlBase64ToUint8Array(base64url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}
