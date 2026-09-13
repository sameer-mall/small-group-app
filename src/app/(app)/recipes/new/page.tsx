import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getSession, requireMember, requireUser, resolveActiveGroup } from "@/lib/dal";
import { RecipeForm } from "@/components/recipe-form";

export default async function NewRecipePage() {
  await requireUser("/recipes/new");
  const session = await getSession();
  const organizations = await auth.api.listOrganizations({ headers: await headers() });

  if (organizations.length === 0) {
    redirect("/");
  }

  const activeGroup = await resolveActiveGroup(
    session?.session.activeOrganizationId,
    organizations,
  );
  await requireMember(activeGroup.id);

  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="font-serif text-2xl font-semibold">Add a recipe</h1>
      <RecipeForm groupId={activeGroup.id} />
    </main>
  );
}
