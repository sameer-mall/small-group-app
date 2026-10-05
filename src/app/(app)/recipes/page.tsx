import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getSession, requireMember, requireUser, resolveActiveGroup } from "@/lib/dal";
import { listRecipes } from "@/lib/recipes";

export default async function RecipesPage() {
  await requireUser();
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

  const recipes = await listRecipes(activeGroup.id);

  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="font-serif text-2xl font-semibold">Recipes</h1>

      {recipes.length === 0 ? (
        <div className="flex flex-col gap-2 py-8 text-center">
          <p className="font-serif text-xl font-semibold">No recipes yet</p>
          <p className="text-muted-foreground text-sm">
            Save a meal your group makes often, then use it to plan a week.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {recipes.map((recipe) => (
            <Link
              key={recipe.id}
              href={`/recipes/${recipe.id}`}
              className="bg-card rounded-card shadow-card min-h-tap flex flex-col justify-center gap-1 px-4 py-3"
            >
              <span className="font-serif text-lg font-semibold">{recipe.name}</span>
              <span className="text-muted-foreground text-sm">
                {recipe.itemCount} item{recipe.itemCount === 1 ? "" : "s"}
              </span>
            </Link>
          ))}
        </div>
      )}

      <Link
        href="/recipes/new"
        className={buttonVariants({ size: "block" })}
      >
        Add a recipe
      </Link>
    </main>
  );
}
