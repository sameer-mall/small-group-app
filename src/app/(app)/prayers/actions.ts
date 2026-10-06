"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/dal";
import { logRefusal } from "@/lib/monitoring";
import {
  drawPrayerBowl,
  joinPrayerBowl,
  leavePrayerBowl,
  submitPrayerRequest,
  withdrawPrayerRequest,
} from "@/lib/prayers";

export type ActionState = { error: string | null; success: boolean };

const prayerRequestForm = z.object({
  body: z
    .string({ error: "Write your request first." })
    .overwrite((body) => body.replace(/\r\n?/g, "\n"))
    .trim()
    .min(1, "Write your request first.")
    .max(1000, "Keep it under 1,000 characters."),
  // The switch posts a hidden "on" only while it is switched on.
  includeName: z.stringbool().default(false),
});

// Domain functions throw plain Error("forbidden" | "not-found" |
// "session-closed" | "too-few-requests" | "still-writing") — see
// src/lib/prayers.ts.
function mapError(err: unknown): string {
  logRefusal(err);
  if (err instanceof Error) {
    if (err.message === "session-closed") return "The bowl has already been drawn.";
    if (err.message === "forbidden") return "Only group members can do that.";
    if (err.message === "not-found") return "That didn't work. Try refreshing the page.";
    if (err.message === "too-few-requests") {
      return "The bowl needs at least two requests before anyone can draw.";
    }
    if (err.message === "still-writing") {
      return "The bowl can be drawn once everyone who's in has put a request in.";
    }
  }
  throw err;
}

// A refused write revalidates too. The parent spec asks for "a plain-language
// message and refreshed data" on rejection — and the commonest rejection here
// is a bowl that was drawn a moment ago, which the refreshed page then shows.
function refused(err: unknown, meetingId: string): ActionState {
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
  const form = prayerRequestForm.safeParse(Object.fromEntries(formData));
  if (!form.success) return { error: form.error.issues[0].message, success: false };
  try {
    await submitPrayerRequest(user.id, meetingId, form.data);
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

export async function leavePrayerBowlAction(
  meetingId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    await leavePrayerBowl(user.id, meetingId);
  } catch (err) {
    return refused(err, meetingId);
  }
  revalidatePath(`/meetings/${meetingId}`);
  return { error: null, success: true };
}

export async function drawPrayerBowlAction(
  meetingId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    // { drew: false } means someone else drew a moment earlier. The bowl got
    // drawn, which is what the tap asked for, so it is not reported as an
    // error — the refreshed page shows the drawn bowl either way.
    await drawPrayerBowl(user.id, meetingId);
  } catch (err) {
    return refused(err, meetingId);
  }
  revalidatePath(`/meetings/${meetingId}`);
  revalidatePath("/prayers");
  return { error: null, success: true };
}
