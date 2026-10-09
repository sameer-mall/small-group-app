"use client";

import { useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { cardState, pushSupported, urlBase64ToUint8Array, type CardState } from "@/lib/notifications-state";
import { subscribeAction, unsubscribeAction } from "@/app/(app)/settings/actions";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

const EXPLAINER = "A heads-up when someone adds a meeting, sets a meal, or shares a recipe.";

// One toggle per device. "On" means this browser holds a push subscription;
// the server row is kept in step by posting the subscription on mount (an
// idempotent upsert) and on every flip. Never prompts for permission on its
// own: the tap on the switch is what triggers the system prompt.
export function NotificationsCard() {
  const [state, setState] = useState<CardState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported = pushSupported();
      let subscribed = false;
      if (supported) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        subscribed = subscription !== null;
        // Keep the server's row current for whoever is signed in on this device.
        if (subscription) void subscribeAction(withUserAgent(subscription)).catch(() => {});
      }
      if (!cancelled) {
        setState(
          cardState({ supported, permission: supported ? Notification.permission : "default", subscribed }),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle() {
    setError(null);
    startTransition(async () => {
      if (state === "on") {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          const endpoint = subscription.endpoint;
          await subscription.unsubscribe();
          await unsubscribeAction(endpoint);
        }
        setState("off");
        return;
      }
      if (!PUBLIC_KEY) {
        setError("Notifications aren't set up on this server yet.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      let subscription: PushSubscription;
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY) as BufferSource,
        });
      } catch {
        // Denied at the prompt (or the browser refused): reflect what it says now.
        setState(cardState({ supported: true, permission: Notification.permission, subscribed: false }));
        return;
      }
      const result = await subscribeAction(withUserAgent(subscription));
      if (result.error) {
        // The browser has a subscription the server never heard of: drop it.
        await subscription.unsubscribe();
        setError(result.error);
        setState("off");
        return;
      }
      setState("on");
    });
  }

  return (
    <div className="bg-card rounded-card shadow-card flex flex-col gap-2.5 p-4">
      <p className="text-muted-foreground tracking-label text-xs uppercase">Notifications</p>
      {state === "unsupported" ? (
        <p className="text-sm">
          Notifications need the Home Screen app. In Safari, tap Share, then Add to Home Screen, and open
          Small Group from there.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p id="notifications-switch-label" className="text-strong font-medium">
              Notify me on this device
            </p>
            {/* Until the browser has answered, the frame renders without a
                switch rather than guessing (same approach as AppearanceCard). */}
            {state !== null && (
              <button
                type="button"
                role="switch"
                aria-checked={state === "on"}
                aria-labelledby="notifications-switch-label"
                disabled={state === "blocked" || pending}
                onClick={toggle}
                className="min-h-tap flex shrink-0 items-center disabled:opacity-50"
              >
                <span
                  className={cn(
                    "relative h-7 w-12 rounded-full transition-colors",
                    state === "on" ? "bg-primary" : "bg-border",
                  )}
                >
                  <span
                    className={cn(
                      "bg-primary-foreground absolute top-[3px] size-[22px] rounded-full transition-all",
                      state === "on" ? "right-[3px]" : "left-[3px]",
                    )}
                  />
                </span>
              </button>
            )}
          </div>
          {state === "blocked" ? (
            <p className="text-tertiary text-xs">
              Notifications are blocked for Small Group. Turn them on in your phone&apos;s Settings, under
              Notifications.
            </p>
          ) : (
            <p className="text-tertiary text-xs">{EXPLAINER}</p>
          )}
          {error && <p className="text-destructive text-xs">{error}</p>}
        </>
      )}
    </div>
  );
}

function withUserAgent(subscription: PushSubscription) {
  return { ...subscription.toJSON(), userAgent: navigator.userAgent.slice(0, 512) };
}
