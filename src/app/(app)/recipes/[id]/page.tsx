import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { notFound } from "next/navigation";
import { requireMember, requireUser } from "@/lib/dal";
import { getRecipe } from "@/lib/recipes";
import { RecipeDeleteButton } from "@/components/recipe-delete-button";

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(`/recipes/${id}`);

  const recipe = await getRecipe(id);
  if (!recipe) notFound();

  // getRecipe does no authorization — this is the group scoping guard, so a
  // member of some other group gets "forbidden" rather than a peek at the
  // recipe. Any member of the group may edit or delete it (see the spec's
  // permission table), so there is no further role check.
  await requireMember(recipe.groupId);

  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="font-serif text-2xl font-semibold">{recipe.name}</h1>

      <div className="bg-card rounded-card shadow-card flex flex-col px-4">
        {recipe.items.map((item) => (
          <span key={item.id} className="border-divider border-b py-3 text-[15px] last:border-b-0">
            {item.label}
          </span>
        ))}
      </div>

      <div className="flex flex-col items-center gap-3">
        <Link
          href={`/recipes/${recipe.id}/edit`}
          className={buttonVariants({ size: "block" })}
        >
          Edit recipe
        </Link>
        <RecipeDeleteButton recipeId={recipe.id} />
      </div>
    </main>
  );
}
