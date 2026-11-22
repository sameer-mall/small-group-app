"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PasskeyIcon } from "@/components/passkey-icon";
import { useTurnOnPasskey } from "@/components/use-turn-on-passkey";
import {
  hasJustSignedIn,
  markOffered,
  passkeyCopy,
  platformPasskeyAvailable,
  takeJustSignedIn,
  wasOffered,
  type PasskeyMethod,
} from "@/lib/passkey-device";

// Offered once per device, only right after a code or Google sign-in in this
// tab (the sign-in form's note), never on top of the What's new popup, and
// never where the device can't make a platform passkey.
export function PasskeyOffer({
  method,
  hasPasskey,
  whatsNewShowing,
}: {
  method: PasskeyMethod;
  hasPasskey: boolean;
  whatsNewShowing: boolean;
}) {
  const copy = passkeyCopy(method);
  const [open, setOpen] = useState(false);
  const { turnOn, pending, error } = useTurnOnPasskey(method);

  useEffect(() => {
    if (!hasJustSignedIn()) return;
    if (hasPasskey || whatsNewShowing || wasOffered()) {
      takeJustSignedIn();
      return;
    }
    // The note is taken only when the sheet really opens, so StrictMode's
    // second effect run (after the first is cancelled) still finds it.
    let cancelled = false;
    void platformPasskeyAvailable().then((available) => {
      if (cancelled) return;
      takeJustSignedIn();
      if (!available) return;
      markOffered();
      setOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [hasPasskey, whatsNewShowing]);

  // A cancelled prompt closes the sheet too; a failure stays open to show why.
  async function turnOnAndClose() {
    if ((await turnOn()) !== "failed") setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="fixed top-auto right-0 bottom-0 left-0 w-full max-w-full translate-x-0 translate-y-0 rounded-t-sheet rounded-b-none bg-surface-subtle pb-[max(2.5rem,env(safe-area-inset-bottom))] duration-150 data-closed:slide-out-to-bottom data-open:slide-in-from-bottom sm:max-w-full">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="bg-surface-tint text-accent-strong mt-2 flex size-16 items-center justify-center rounded-full">
            <PasskeyIcon kind={method.kind} className="size-8" strokeWidth={1.75} />
          </div>
          <div className="flex flex-col gap-2">
            <DialogTitle className="font-serif text-xl font-semibold">{copy.offerTitle}</DialogTitle>
            <DialogDescription className="text-muted-foreground text-base">{copy.offerBody}</DialogDescription>
          </div>
          <div className="mt-2 flex w-full flex-col gap-2">
            <Button size="block" onClick={turnOnAndClose} disabled={pending}>
              {copy.turnOn}
            </Button>
            <Button variant="outline" size="block" onClick={() => setOpen(false)} disabled={pending}>
              Not now
            </Button>
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <p className="text-tertiary text-xs">You can change this any time in Settings.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
