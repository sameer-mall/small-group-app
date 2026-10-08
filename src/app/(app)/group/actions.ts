"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/dal";
import {
  approveRequest,
  demoteMember,
  denyRequest,
  leaveGroup,
  promoteMember,
  removeMember,
  renameGroup,
  rotateInviteCode,
} from "@/lib/groups";
import { logRefusal } from "@/lib/monitoring";
import {
  displayNameForm,
  markWhatsNewSeen,
  releaseIdInput,
  updateDisplayName,
} from "@/lib/profile";

export type ActionState = { error: string | null; success: boolean };

const renameGroupForm = z.object({
  name: z
    .string({ error: "Group name can't be empty." })
    .trim()
    .min(1, "Group name can't be empty."),
});

// Domain functions throw plain Error("forbidden" | "not-found" | "last-admin"
// | "already-member") — see src/lib/groups.ts. Map the ones reachable from
// this screen to copy the UI can show inline; anything else (e.g.
// "already-member", which can't happen from these actions) rethrows and hits
// the default error boundary.
function mapError(err: unknown): string {
  logRefusal(err);
  if (err instanceof Error) {
    if (err.message === "last-admin") {
      return "Promote another admin first. A group always needs one.";
    }
    if (err.message === "forbidden") {
      return "Only admins can do that.";
    }
    if (err.message === "not-found") {
      // Reachable via a race: someone else approved/denied the same request,
      // or removed the same member, between this page's render and the click.
      return "That didn't work. Try refreshing the page.";
    }
  }
  throw err;
}

export async function approveRequestAction(
  requestId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    await approveRequest(user.id, requestId);
  } catch (err) {
    return { error: mapError(err), success: false };
  }
  revalidatePath("/group");
  return { error: null, success: true };
}

export async function denyRequestAction(
  requestId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    await denyRequest(user.id, requestId);
  } catch (err) {
    return { error: mapError(err), success: false };
  }
  revalidatePath("/group");
  return { error: null, success: true };
}

export async function promoteMemberAction(
  groupId: string,
  memberUserId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    await promoteMember(user.id, groupId, memberUserId);
  } catch (err) {
    return { error: mapError(err), success: false };
  }
  revalidatePath("/group");
  return { error: null, success: true };
}

export async function demoteMemberAction(
  groupId: string,
  memberUserId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    await demoteMember(user.id, groupId, memberUserId);
  } catch (err) {
    return { error: mapError(err), success: false };
  }
  revalidatePath("/group");
  return { error: null, success: true };
}

export async function removeMemberAction(
  groupId: string,
  memberUserId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    await removeMember(user.id, groupId, memberUserId);
  } catch (err) {
    return { error: mapError(err), success: false };
  }
  revalidatePath("/group");
  return { error: null, success: true };
}

export async function leaveGroupAction(
  groupId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    await leaveGroup(user.id, groupId);
  } catch (err) {
    return { error: mapError(err), success: false };
  }
  revalidatePath("/group");
  redirect("/");
}

export async function renameGroupAction(
  groupId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const form = renameGroupForm.safeParse(Object.fromEntries(formData));
  if (!form.success) return { error: form.error.issues[0].message, success: false };
  try {
    await renameGroup(user.id, groupId, form.data.name);
  } catch (err) {
    return { error: mapError(err), success: false };
  }
  revalidatePath("/group");
  return { error: null, success: true };
}

export async function rotateInviteAction(
  groupId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    await rotateInviteCode(user.id, groupId);
  } catch (err) {
    return { error: mapError(err), success: false };
  }
  revalidatePath("/group");
  return { error: null, success: true };
}

export async function updateDisplayNameAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const form = displayNameForm.safeParse(Object.fromEntries(formData));
  if (!form.success) return { error: form.error.issues[0].message, success: false };
  try {
    await updateDisplayName(user.id, form.data.name);
  } catch (err) {
    return { error: mapError(err), success: false };
  }
  // The name is read on every screen (meal claims, prayers, members), not just
  // this one, and every one of them sits under the (app) route group. Don't
  // revalidate the root layout ("/", "layout") instead: every route carries
  // that tag, so it also marks the static service worker (/serwist/sw.js)
  // stale, and Vercel's runtime rebuild of sw.js can't work (SMALL-GROUP-7).
  // src/revalidation.test.ts guards this.
  revalidatePath("/(app)", "layout");
  return { error: null, success: true };
}

// The What's new popup closing, however it closed. The dialog has already
// shut, so nothing comes back to show: if this fails, the popup simply shows
// again on the next open. No revalidation either. The dialog keeps itself
// closed, and the next server render reads the saved value.
export async function markWhatsNewSeenAction(releaseId: number): Promise<void> {
  const user = await requireUser();
  const input = releaseIdInput.safeParse(releaseId);
  if (!input.success) return;
  try {
    await markWhatsNewSeen(user.id, input.data);
  } catch (err) {
    logRefusal(err);
    // The account was deleted between render and close; nothing to save.
    if (err instanceof Error && err.message === "not-found") return;
    throw err;
  }
}
