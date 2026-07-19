"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/dal";
import { createGroup } from "@/lib/groups";

export async function createGroupAction(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/create-group");

  const { groupId } = await createGroup(user.id, name);
  await auth.api.setActiveOrganization({
    body: { organizationId: groupId },
    headers: await headers(),
  });
  redirect("/");
}
