"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/dal";
import { createGroup } from "@/lib/groups";

const createGroupForm = z.object({
  name: z.string().trim().min(1),
});

export async function createGroupAction(formData: FormData) {
  const user = await requireUser();
  const form = createGroupForm.safeParse(Object.fromEntries(formData));
  if (!form.success) redirect("/create-group");

  const { groupId } = await createGroup(user.id, form.data.name);
  await auth.api.setActiveOrganization({
    body: { organizationId: groupId },
    headers: await headers(),
  });
  redirect("/");
}
