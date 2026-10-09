"use server";

import { z } from "zod";
import { requireUser } from "@/lib/dal";
import { logRefusal } from "@/lib/monitoring";
import { deleteSubscription, pushSubscriptionInput, saveSubscription } from "@/lib/push";

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
