"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { createMeeting, deleteMeeting, updateMeeting } from "@/lib/meetings";

export type ActionState = { error: string | null; success: boolean };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Editing and deleting are creator-or-admin, not member-at-large (see the
// spec's permission table), so "forbidden" from those needs its own copy. The
// page hides the menu from everyone else, but a member demoted since their
// last load can still reach here with a stale page.
const MANAGE_FORBIDDEN = "Only the meeting's creator or an admin can do that.";

// Domain functions throw plain Error("forbidden" | "not-found") — see
// src/lib/meetings.ts. Map the ones reachable from these actions to copy the
// UI can show inline; anything else rethrows and hits the default error
// boundary.
function mapError(err: unknown, forbidden = "Only group members can do that."): string {
  if (err instanceof Error) {
    if (err.message === "forbidden") {
      return forbidden;
    }
    if (err.message === "not-found") {
      return "That didn't work. Try refreshing the page.";
    }
  }
  throw err;
}

export async function createMeetingAction(
  groupId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  if (!title || !date) {
    return { error: "Add a title and a date.", success: false };
  }
  // A hand-crafted POST can send anything in `date`; without this check
  // Postgres raises an invalid-input error the user sees as a 500 rather
  // than a message.
  if (!DATE_RE.test(date)) {
    return { error: "Enter a valid date.", success: false };
  }
  try {
    await createMeeting(user.id, groupId, { title, date });
  } catch (err) {
    return { error: mapError(err), success: false };
  }
  revalidatePath("/");
  return { error: null, success: true };
}

export async function updateMeetingAction(
  meetingId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  if (!title || !date) {
    return { error: "Add a title and a date.", success: false };
  }
  if (!DATE_RE.test(date)) {
    return { error: "Enter a valid date.", success: false };
  }
  try {
    await updateMeeting(user.id, meetingId, { title, date });
  } catch (err) {
    return { error: mapError(err, MANAGE_FORBIDDEN), success: false };
  }
  revalidatePath(`/meetings/${meetingId}`);
  revalidatePath("/");
  return { error: null, success: true };
}

export async function deleteMeetingAction(
  meetingId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    await deleteMeeting(user.id, meetingId);
  } catch (err) {
    return { error: mapError(err, MANAGE_FORBIDDEN), success: false };
  }
  revalidatePath("/");
  // Outside the try: redirect() signals by throwing, and catching that here
  // would turn a successful delete into an error message.
  redirect("/");
}
