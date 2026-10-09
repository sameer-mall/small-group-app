"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PROMPT_STORAGE_KEY,
  isStandalone,
  pushSupported,
  shouldPromptForNotifications,
} from "@/lib/notifications-state";
import { currentSubscription, subscribeThisDevice } from "@/lib/notifications-client";

// Asks, once per device, on the first launch of the installed app, whether to
// turn notifications on (spec: 2026-10-08-notification-prompt-design.md).
// The browser owns the permission, so this can only offer; the tap on Turn on
// is the gesture that lets the system prompt appear. `deferred` is true when
// the What's new popup has something to show this launch: then this waits for
// the next one.
export function NotificationPromptDialog({ deferred }: { deferred: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported = pushSupported();
      const subscribed = supported ? (await currentSubscription()) !== null : false;
      const show = shouldPromptForNotifications({
        supported,
        standalone: isStandalone(),
        permission: supported ? Notification.permission : "default",
        subscribed,
        remembered: remember(),
        deferred,
      });
      if (!cancelled && show) setOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [deferred]);

  function close(outcome: "done" | "dismissed") {
    remember(outcome);
    setOpen(false);
  }

  function turnOn() {
    setError(null);
    startTransition(async () => {
      const outcome = await subscribeThisDevice();
      // Allowed or denied, the question is answered. A failure that isn't a
      // denial leaves the dialog up with the reason, so they can retry.
      if (outcome === "on" || outcome === "blocked") {
        close("done");
        return;
      }
      setError(outcome.error);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close("dismissed");
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif text-xl font-semibold">Hear about meals and meetings</DialogTitle>
          <DialogDescription>
            Get a heads-up on this phone when someone adds a meeting, sets a meal, or shares a recipe. You
            can change this anytime under Settings.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <div className="flex flex-col gap-2">
          <Button type="button" size="block" onClick={turnOn} disabled={pending}>
            Turn on notifications
          </Button>
          <Button type="button" variant="outline" size="block" onClick={() => close("dismissed")}>
            Not now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// This device's record of having been asked. Storage can be missing or throw
// (private mode, cleared data): then the member is simply asked again, the
// same as after a reinstall.
function remember(value?: "done" | "dismissed"): string | null {
  try {
    if (value !== undefined) {
      window.localStorage.setItem(PROMPT_STORAGE_KEY, value);
      return value;
    }
    return window.localStorage.getItem(PROMPT_STORAGE_KEY);
  } catch {
    return null;
  }
}
