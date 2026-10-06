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
import { displayNameForm, updateDisplayName } from "@/lib/profile";

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
  // this one. revalidatePath("/", "layout") drops the whole cache tree.
  revalidatePath("/", "layout");
  return { error: null, success: true };
}
