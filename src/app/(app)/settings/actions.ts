"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccount, requireUser } from "@/lib/dal";
import { avatarForm, removeAvatar, saveAvatar, UNREADABLE_PHOTO } from "@/lib/avatars";
import { logRefusal } from "@/lib/monitoring";
import { deleteSubscription, pushSubscriptionInput, saveSubscription } from "@/lib/push";
import type { ActionState } from "@/app/(app)/group/actions";

export type { ActionState };
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
