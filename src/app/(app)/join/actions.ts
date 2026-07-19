"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { requestToJoin } from "@/lib/groups";

export async function requestToJoinAction(code: string) {
  const user = await requireUser(`/join/${code}`);

  try {
    await requestToJoin(user.id, code);
  } catch (err) {
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
