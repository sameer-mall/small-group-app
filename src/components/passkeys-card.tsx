"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PasskeyIcon } from "@/components/passkey-icon";
import { rememberPasskeyAction, removePasskeyAction } from "@/app/(app)/settings/actions";
import type { ActionState } from "@/app/(app)/group/actions";
import { authClient, UNREACHABLE_MESSAGE } from "@/lib/auth-client";
import {
  addedLabel,
  kindForDeviceName,
  passkeyCopy,
  passkeyErrorKind,
  passkeySupported,
  type PasskeyKind,
  type PasskeyMethod,
} from "@/lib/passkey-device";

export type PasskeyRow = { id: string; name: string | null; createdAt: string | null };

const noSubscribe = () => () => {};
const initialState: ActionState = { error: null, success: false };

function IconTile({ kind }: { kind: PasskeyKind }) {
  return (
    <div className="bg-surface-tint text-accent-strong flex size-10 shrink-0 items-center justify-center rounded-chip">
      <PasskeyIcon kind={kind} className="size-[22px]" />
    </div>
  );
}

function PasskeyRowItem({ passkey, label, kind }: { passkey: PasskeyRow; label: string; kind: PasskeyKind }) {
  const [state, formAction, pending] = useActionState(removePasskeyAction, initialState);
  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex items-center gap-3">
        <IconTile kind={kind} />
        <div className="flex flex-1 flex-col gap-0.5">
          <p className="text-base font-semibold">{label}</p>
          {passkey.createdAt && (
            <p className="text-muted-foreground text-sm" suppressHydrationWarning>
              Added {addedLabel(passkey.createdAt)}
            </p>
          )}
        </div>
        <form action={formAction}>
          <input type="hidden" name="id" value={passkey.id} />
          <Button type="submit" variant="destructive" size="pill" disabled={pending} aria-label={`Remove ${label}`}>
            Remove
          </Button>
        </form>
      </div>
      {state.error && <p className="text-destructive text-xs">{state.error}</p>}
    </li>
  );
}

export function PasskeysCard({
  method,
  thisDeviceId,
  passkeys,
}: {
  method: PasskeyMethod;
  thisDeviceId: string | null;
  passkeys: PasskeyRow[];
}) {
  const router = useRouter();
  const copy = passkeyCopy(method);
  const supported = useSyncExternalStore(noSubscribe, passkeySupported, () => true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // UNKNOWN_PASSKEY ("unknown"): this device signed in with one of these
  // passkeys, but the server couldn't tell which, so no row is "This iPhone"
  // and there's no "turn on for this phone" either.
  const hasThisDevice = thisDeviceId === "unknown" || passkeys.some((p) => p.id === thisDeviceId);

  async function turnOn() {
    setPending(true);
    setError(null);
    try {
      const { data, error } = await authClient.passkey.addPasskey({
        name: method.deviceName,
        authenticatorAttachment: "platform",
      });
      if (error || !data) {
        if (passkeyErrorKind(error) !== "cancelled") setError(copy.turnOnFailed);
        return;
      }
      await rememberPasskeyAction(data.id);
      router.refresh();
    } catch {
      setError(UNREACHABLE_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="passkeys-title" className="bg-card rounded-card shadow-card flex flex-col gap-2.5 p-4">
      <div className="flex items-center justify-between">
        <p id="passkeys-title" className="text-muted-foreground tracking-label text-xs uppercase">
          {copy.cardTitle}
        </p>
        {supported && passkeys.length > 0 && (
          <span className="bg-success-tint text-success-strong rounded-full px-2.5 py-0.5 text-xs font-bold">On</span>
        )}
      </div>
      {!supported ? (
        <p className="text-sm">Not available in this browser.</p>
      ) : passkeys.length === 0 ? (
        <>
          <div className="flex items-start gap-3">
            <IconTile kind={method.kind} />
            <p className="text-base">{copy.explainer}</p>
          </div>
          <Button variant="secondary" size="block" onClick={turnOn} disabled={pending}>
            {copy.turnOn}
          </Button>
        </>
      ) : (
        <>
          <ul className="divide-divider flex flex-col divide-y">
            {passkeys.map((p) => (
              <PasskeyRowItem
                key={p.id}
                passkey={p}
                label={p.id === thisDeviceId ? method.thisDevice : (p.name ?? "Passkey")}
                kind={p.id === thisDeviceId ? method.kind : kindForDeviceName(p.name)}
              />
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            Removing one stops it working right away. Sign in with an email code any time.
          </p>
          {!hasThisDevice && (
            <Button variant="secondary" size="block" onClick={turnOn} disabled={pending}>
              {copy.turnOnHere}
            </Button>
          )}
        </>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </section>
  );
}
