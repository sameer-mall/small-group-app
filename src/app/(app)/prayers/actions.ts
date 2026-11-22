"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/dal";
import { logRefusal } from "@/lib/monitoring";
import { notifyPrayersAssigned } from "@/lib/notifications";
import {
  assignPrayers,
  deletePrayerRequest,
  joinPrayerWall,
  leavePrayerWall,
  postPrayerRequest,
} from "@/lib/prayers";

export type ActionState = { error: string | null; success: boolean };

const prayerRequestForm = z.object({
  body: z
    .string({ error: "Write your request first." })
    .overwrite((body) => body.replace(/\r\n?/g, "\n"))
    .trim()
    .min(1, "Write your request first.")
    .max(1000, "Keep it under 1,000 characters."),
});

// Domain functions throw plain Error("forbidden" | "not-found" |
// "session-closed" | "too-few-requests" | "still-writing") — see
// src/lib/prayers.ts.
function mapError(err: unknown): string {
  logRefusal(err);
  if (err instanceof Error) {
    if (err.message === "session-closed") return "Prayers have already been assigned.";
    if (err.message === "forbidden") return "Only group members can do that.";
    if (err.message === "not-found") return "That didn't work. Try refreshing the page.";
    if (err.message === "too-few-requests") {
      return "Prayers can be assigned once two requests are in.";
    }
    if (err.message === "still-writing") {
      return "Prayers can be assigned once everyone who's in has posted.";
    }
  }
  throw err;
}

// The wall, its meeting card, and the home chip all read the same rows.
function revalidateWall(meetingId: string) {
  revalidatePath(`/meetings/${meetingId}/prayers`);
  revalidatePath(`/meetings/${meetingId}`);
  revalidatePath("/");
}

// A refused write revalidates too. The parent spec asks for "a plain-language
// message and refreshed data" on rejection — and the commonest rejection here
// is a bowl that was drawn a moment ago, which the refreshed page then shows.
function refused(err: unknown, meetingId: string): ActionState {
  const error = mapError(err);
  revalidateWall(meetingId);
  return { error, success: false };
}

export async function joinPrayerWallAction(
  meetingId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    await joinPrayerWall(user.id, meetingId);
  } catch (err) {
    return refused(err, meetingId);
  }
  revalidateWall(meetingId);
  return { error: null, success: true };
}

export async function postPrayerRequestAction(
  meetingId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const form = prayerRequestForm.safeParse(Object.fromEntries(formData));
  if (!form.success) return { error: form.error.issues[0].message, success: false };
  try {
    await postPrayerRequest(user.id, meetingId, form.data);
  } catch (err) {
    return refused(err, meetingId);
  }
  revalidateWall(meetingId);
  return { error: null, success: true };
}

export async function deletePrayerRequestAction(
  meetingId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    await deletePrayerRequest(user.id, meetingId);
  } catch (err) {
    return refused(err, meetingId);
  }
  revalidateWall(meetingId);
  return { error: null, success: true };
}

export async function leavePrayerWallAction(
  meetingId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    await leavePrayerWall(user.id, meetingId);
  } catch (err) {
    return refused(err, meetingId);
  }
  revalidateWall(meetingId);
  return { error: null, success: true };
}

export async function assignPrayersAction(
  meetingId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  let result: { assigned: boolean };
  try {
    result = await assignPrayers(user.id, meetingId);
  } catch (err) {
    return refused(err, meetingId);
  }
  // Only the tap that actually assigned tells people; a second tap is a no-op.
  if (result.assigned) after(() => notifyPrayersAssigned({ actorId: user.id, meetingId }));
  revalidateWall(meetingId);
  revalidatePath("/prayers");
  return { error: null, success: true };
}
