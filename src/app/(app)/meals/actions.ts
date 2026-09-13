"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { claimItem, releaseItem, setMeal } from "@/lib/meals";

export type ActionState = { error: string | null; success: boolean };

// Domain functions throw plain Error("forbidden" | "not-found" |
// "already-claimed" | "not-claimed") — see src/lib/meals.ts. Map them to copy
// the row can show inline; anything else rethrows to the error boundary.
function mapError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === "already-claimed") {
      return "Someone just claimed that one.";
    }
    if (err.message === "not-claimed") {
      return "That isn't yours to release.";
    }
    if (err.message === "forbidden") {
      return "Only group members can do that.";
    }
    if (err.message === "not-found") {
      return "That didn't work — try refreshing the page.";
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
