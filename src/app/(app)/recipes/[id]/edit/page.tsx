import { notFound } from "next/navigation";
import { requireMember, requireUser } from "@/lib/dal";
import { getRecipe } from "@/lib/recipes";
import { RecipeForm } from "@/components/recipe-form";

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(`/recipes/${id}/edit`);

  const recipe = await getRecipe(id);
  if (!recipe) notFound();

  // getRecipe does no authorization — this scopes it to the actor's group.
  await requireMember(recipe.groupId);

  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="font-serif text-2xl font-semibold">Edit recipe</h1>
      <RecipeForm groupId={recipe.groupId} recipe={recipe} />
    </main>
  );
}
