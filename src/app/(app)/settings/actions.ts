"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccount, requireUser } from "@/lib/dal";
import { avatarForm, removeAvatar, saveAvatar, UNREADABLE_PHOTO } from "@/lib/avatars";
import { logRefusal } from "@/lib/monitoring";
import { ownsPasskey, passkeysFor, removePasskey } from "@/lib/passkeys";
import { PASSKEY_COOKIE, UNKNOWN_PASSKEY, passkeyCookieOptions } from "@/lib/passkey-cookie";
import { deleteSubscription, pushSubscriptionInput, saveSubscription } from "@/lib/push";
// Not re-exported: Next treats every export of a "use server" file as an
// action, type-only ones included, and the client then fails at runtime
// with "ActionState is not defined". Clients import it from group/actions.
import type { ActionState } from "@/app/(app)/group/actions";

export type SubscribeState = { error: string | null };

// The card posts PushSubscription.toJSON() plus the user agent. Parsed here,
// on the server, like every other action's input.
export async function subscribeAction(input: unknown): Promise<SubscribeState> {
  const user = await requireUser();
  const parsed = pushSubscriptionInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await saveSubscription(user.id, parsed.data);
  } catch (err) {
    logRefusal(err);
    throw err;
  }
  return { error: null };
}

const endpointInput = z.url({ protocol: /^https$/ });

export async function unsubscribeAction(endpoint: string): Promise<void> {
  const user = await requireUser();
  const parsed = endpointInput.safeParse(endpoint);
  // A malformed endpoint can't match a row anyway; nothing to do.
  if (!parsed.success) return;
  await deleteSubscription(user.id, parsed.data);
}

// Domain refusals from src/lib/avatars.ts mapped to copy the picker shows
// inline; anything else rethrows to the error boundary.
function mapAvatarError(err: unknown): string {
  logRefusal(err);
  if (err instanceof Error) {
    if (err.message === "unreadable-image") return UNREADABLE_PHOTO;
    if (err.message === "unavailable") return "Photos aren't available right now.";
    if (err.message === "not-found") return "That didn't work. Try refreshing the page.";
  }
  throw err;
}

// Photos show wherever names do, all under (app), plus the Welcome screen
// where the first one is added. Same (app) scope as a name change, for the
// same reason (src/revalidation.test.ts).
function revalidateAvatars() {
  revalidatePath("/(app)", "layout");
  revalidatePath("/welcome");
}

// The picker posts the cropped photo the moment the member confirms the crop
// (src/components/avatar-picker.tsx). requireAccount, not requireUser: on
// Welcome the member has no name yet.
export async function updateAvatarAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const account = await requireAccount();
  const form = avatarForm.safeParse(Object.fromEntries(formData));
  if (!form.success) return { error: form.error.issues[0].message, success: false };
  try {
    await saveAvatar(account.id, Buffer.from(await form.data.photo.arrayBuffer()));
  } catch (err) {
    return { error: mapAvatarError(err), success: false };
  }
  revalidateAvatars();
  return { error: null, success: true };
}

export async function removeAvatarAction(
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const account = await requireAccount();
  try {
    await removeAvatar(account.id);
  } catch (err) {
    return { error: mapAvatarError(err), success: false };
  }
  revalidateAvatars();
  return { error: null, success: true };
}

const passkeyIdInput = z.string().min(1);

// Called by the offer sheet and the Settings card right after the browser
// creates a passkey. Only a passkey the member owns is remembered.
export async function rememberPasskeyAction(id: unknown): Promise<void> {
  const user = await requireUser();
  const parsed = passkeyIdInput.safeParse(id);
  if (!parsed.success || !(await ownsPasskey(user.id, parsed.data))) return;
  (await cookies()).set(PASSKEY_COOKIE, parsed.data, passkeyCookieOptions);
}

const removePasskeyForm = z.object({ id: z.string({ error: "That sign-in wasn't found." }).min(1) });

function mapPasskeyError(err: unknown): string {
  logRefusal(err);
  if (err instanceof Error && err.message === "not-found") {
    return "That sign-in was already removed. Refresh to see the current list.";
  }
  throw err;
}

export async function removePasskeyAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const form = removePasskeyForm.safeParse(Object.fromEntries(formData));
  if (!form.success) return { error: form.error.issues[0].message, success: false };
  try {
    await removePasskey(user.id, form.data.id);
  } catch (err) {
    return { error: mapPasskeyError(err), success: false };
  }
  // Forget this device's passkey when it's the one removed, or when the device
  // only knew "unknown" and the member has none left: Welcome back would offer
  // a passkey that no longer exists.
  const jar = await cookies();
  const remembered = jar.get(PASSKEY_COOKIE)?.value;
  if (
    remembered === form.data.id ||
    (remembered === UNKNOWN_PASSKEY && (await passkeysFor(user.id)).length === 0)
  ) {
    jar.delete(PASSKEY_COOKIE);
  }
  revalidatePath("/(app)", "layout");
  return { error: null, success: true };
}
