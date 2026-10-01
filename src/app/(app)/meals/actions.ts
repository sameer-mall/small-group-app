"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { addAdhocItem, claimItem, releaseItem, removeAdhocItem, setMeal } from "@/lib/meals";

export type ActionState = { error: string | null; success: boolean };

// Domain functions throw plain Error("forbidden" | "not-found" |
// "already-claimed" | "not-claimed") — see src/lib/meals.ts. Map them to copy
// the row can show inline; anything else rethrows to the error boundary.
function mapError(err: unknown, forbidden = "Only group members can do that."): string {
  if (err instanceof Error) {
    if (err.message === "already-claimed") {
      return "Someone just claimed that one.";
    }
    if (err.message === "not-claimed") {
      return "That isn't yours to release.";
    }
    if (err.message === "forbidden") {
      return forbidden;
    }
    if (err.message === "not-found") {
      return "That didn't work. Try refreshing the page.";
    }
  }
  throw err;
}

export async function setMealAction(
  meetingId: string,
  recipeId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    await setMeal(user.id, meetingId, recipeId);
  } catch (err) {
    return { error: mapError(err), success: false };
  }
  revalidatePath(`/meetings/${meetingId}`);
  return { error: null, success: true };
}

export async function claimItemAction(
  meetingId: string,
  itemId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    await claimItem(user.id, itemId);
  } catch (err) {
    return { error: mapError(err), success: false };
  }
  revalidatePath(`/meetings/${meetingId}`);
  return { error: null, success: true };
}

export async function releaseItemAction(
  meetingId: string,
  itemId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    await releaseItem(user.id, itemId);
  } catch (err) {
    return { error: mapError(err), success: false };
  }
  revalidatePath(`/meetings/${meetingId}`);
  return { error: null, success: true };
}

// Removing an ad-hoc item is the adder's or an admin's, and only while nobody
// has claimed it — so "forbidden" here covers two different refusals and needs
// its own copy rather than the member-at-large default.
const REMOVE_FORBIDDEN = "Only the person who added it, or an admin, can remove it.";

export async function addAdhocItemAction(
  meetingId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const label = String(formData.get("label") ?? "").trim();
  if (!label) {
    return { error: "Add a name for the item.", success: false };
  }
  try {
    await addAdhocItem(user.id, meetingId, label);
  } catch (err) {
    return { error: mapError(err), success: false };
  }
  revalidatePath(`/meetings/${meetingId}`);
  return { error: null, success: true };
}

export async function removeAdhocItemAction(
  meetingId: string,
  itemId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    await removeAdhocItem(user.id, itemId);
  } catch (err) {
    return { error: mapError(err, REMOVE_FORBIDDEN), success: false };
  }
  revalidatePath(`/meetings/${meetingId}`);
  return { error: null, success: true };
}
