import { urlBase64ToUint8Array } from "@/lib/notifications-state";
import { subscribeAction, unsubscribeAction } from "@/app/(app)/settings/actions";

// The browser side of turning notifications on and off for this device,
// shared by the Settings toggle and the first-launch dialog so the two can't
// drift. Browser-only: no zod, no db. Calling subscribeThisDevice is what
// triggers the system permission prompt, so it must follow a tap.

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export const NOT_CONFIGURED = "Notifications aren't set up on this server yet.";

export type SubscribeOutcome = "on" | "blocked" | { error: string };

export async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

// Re-posts an existing subscription so the server's row names whoever is
// signed in on this device. Idempotent; failures are nobody's problem here.
export function syncSubscription(subscription: PushSubscription): void {
  void subscribeAction(withUserAgent(subscription)).catch(() => {});
}

export async function subscribeThisDevice(): Promise<SubscribeOutcome> {
  if (!PUBLIC_KEY) return { error: NOT_CONFIGURED };
  const registration = await navigator.serviceWorker.ready;
  let subscription: PushSubscription;
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY) as BufferSource,
    });
  } catch {
    // Denied at the prompt, or the browser refused. "blocked" only if the
    // browser now says so; otherwise the member can simply try again.
    return Notification.permission === "denied" ? "blocked" : { error: "That didn't work. Try again." };
  }
  const result = await subscribeAction(withUserAgent(subscription));
  if (result.error) {
    // The browser holds a subscription the server never heard of: drop it.
    await subscription.unsubscribe();
    return { error: result.error };
  }
  return "on";
}

export async function unsubscribeThisDevice(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await unsubscribeAction(endpoint);
}

function withUserAgent(subscription: PushSubscription) {
  return { ...subscription.toJSON(), userAgent: navigator.userAgent.slice(0, 512) };
}
