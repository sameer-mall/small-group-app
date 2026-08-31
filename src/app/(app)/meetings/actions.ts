"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { createMeeting } from "@/lib/meetings";

export type ActionState = { error: string | null; success: boolean };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Domain functions throw plain Error("forbidden" | "not-found") — see
// src/lib/meetings.ts. Map the ones reachable from this action to copy the
// UI can show inline; anything else rethrows and hits the default error
// boundary.
function mapError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === "forbidden") {
      return "Only group members can do that.";
    }
    if (err.message === "not-found") {
      return "That didn't work — try refreshing the page.";
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
