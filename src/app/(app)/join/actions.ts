"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireUser } from "@/lib/dal";
import { requestToJoin } from "@/lib/groups";
import { logRefusal } from "@/lib/monitoring";
import { notifyJoinRequested } from "@/lib/notifications";

export async function requestToJoinAction(code: string) {
  const user = await requireUser(`/join/${code}`);

  try {
    const { groupId, created } = await requestToJoin(user.id, code);
    // Only a new request pings the admins; a repeat tap on the link does not.
    if (created) after(() => notifyJoinRequested({ groupId, requesterId: user.id }));
  } catch (err) {
    logRefusal(err);
    if (err instanceof Error && err.message === "already-member") {
      redirect("/");
    }
    if (!(err instanceof Error && err.message === "not-found")) {
      throw err;
    }
    // "not-found" here means the code died between page render and submit
    // (e.g. the admin rotated it). Fall through to the redirect below —
    // reloading the join page re-resolves the code and shows the invalid
    // link message itself, so we don't duplicate that copy here.
  }

  redirect(`/join/${code}`);
}
