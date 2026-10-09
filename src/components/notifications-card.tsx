"use client";

import { useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { cardState, pushSupported, type CardState } from "@/lib/notifications-state";
import {
  currentSubscription,
  subscribeThisDevice,
  syncSubscription,
  unsubscribeThisDevice,
} from "@/lib/notifications-client";

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
        const subscription = await currentSubscription();
        subscribed = subscription !== null;
        // Keep the server's row current for whoever is signed in on this device.
        if (subscription) syncSubscription(subscription);
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
        await unsubscribeThisDevice();
        setState("off");
        return;
      }
      const outcome = await subscribeThisDevice();
      if (outcome === "on" || outcome === "blocked") {
        setState(outcome);
        return;
      }
      setError(outcome.error);
      setState("off");
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
