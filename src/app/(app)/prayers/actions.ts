"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { joinPrayerBowl, submitPrayerRequest, withdrawPrayerRequest } from "@/lib/prayers";

export type ActionState = { error: string | null; success: boolean };

const MAX_REQUEST_LENGTH = 1000;

// Domain functions throw plain Error("forbidden" | "not-found" |
// "session-closed" | "too-few-requests") — see src/lib/prayers.ts.
function mapError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === "session-closed") return "The bowl has already been drawn.";
    if (err.message === "forbidden") return "Only group members can do that.";
    if (err.message === "not-found") return "That didn't work — try refreshing the page.";
  }
  throw err;
}

// A refused write revalidates too. The parent spec asks for "a plain-language
// message and refreshed data" on rejection — and the commonest rejection here
// is a bowl that was drawn a moment ago, which the refreshed page then shows.
async function refused(err: unknown, meetingId: string): Promise<ActionState> {
  const error = mapError(err);
  revalidatePath(`/meetings/${meetingId}`);
  return { error, success: false };
}

export async function joinPrayerBowlAction(
  meetingId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    await joinPrayerBowl(user.id, meetingId);
  } catch (err) {
    return refused(err, meetingId);
  }
  revalidatePath(`/meetings/${meetingId}`);
  return { error: null, success: true };
}

export async function submitPrayerRequestAction(
  meetingId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const body = String(formData.get("body") ?? "").trim();
  // The switch posts a hidden "on" only while it is switched on.
  const includeName = formData.get("includeName") === "on";
  if (!body) return { error: "Write your request first.", success: false };
  if (body.length > MAX_REQUEST_LENGTH) {
    return { error: "Keep it under 1,000 characters.", success: false };
  }
  try {
    await submitPrayerRequest(user.id, meetingId, { body, includeName });
  } catch (err) {
    return refused(err, meetingId);
  }
  revalidatePath(`/meetings/${meetingId}`);
  return { error: null, success: true };
}

export async function withdrawPrayerRequestAction(
  meetingId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    await withdrawPrayerRequest(user.id, meetingId);
  } catch (err) {
    return refused(err, meetingId);
  }
  revalidatePath(`/meetings/${meetingId}`);
  return { error: null, success: true };
}
