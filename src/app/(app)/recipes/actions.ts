"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { createRecipe, deleteRecipe, updateRecipe } from "@/lib/recipes";

export type ActionState = { error: string | null; success: boolean };

// Domain functions throw plain Error("forbidden" | "not-found") — see
// src/lib/recipes.ts. Map the ones reachable from these actions to copy the
// UI can show inline; anything else rethrows and hits the default error
// boundary.
function mapError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === "forbidden") {
      return "Only group members can do that.";
    }
    if (err.message === "not-found") {
      return "That didn't work — try refreshing the page.";
    }
  }
  throw err;
}

// The form submits one `item` field per row, including rows the user left
// blank or emptied; blanks are dropped rather than saved as empty items.
function parseRecipe(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    items: formData
      .getAll("item")
      .map((value) => String(value).trim())
      .filter(Boolean),
  };
}

function validate({ name, items }: { name: string; items: string[] }): string | null {
  if (!name) return "Add a name for the recipe.";
  if (items.length === 0) return "Add at least one item.";
  return null;
}

export async function createRecipeAction(
  groupId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const input = parseRecipe(formData);
  const invalid = validate(input);
  if (invalid) return { error: invalid, success: false };

  try {
    await createRecipe(user.id, groupId, input);
  } catch (err) {
    return { error: mapError(err), success: false };
  }
  revalidatePath("/recipes");
  // Outside the try: redirect() signals by throwing, and catching that here
  // would turn a successful save into an error message.
  redirect("/recipes");
}

export async function updateRecipeAction(
  recipeId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const input = parseRecipe(formData);
  const invalid = validate(input);
  if (invalid) return { error: invalid, success: false };

  try {
    await updateRecipe(user.id, recipeId, input);
  } catch (err) {
    return { error: mapError(err), success: false };
  }
  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);
  // Back to the recipe just saved, rather than leaving the editor open with
  // no sign anything happened.
  redirect(`/recipes/${recipeId}`);
}

export async function deleteRecipeAction(
  recipeId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    await deleteRecipe(user.id, recipeId);
  } catch (err) {
    return { error: mapError(err), success: false };
  }
  revalidatePath("/recipes");
  redirect("/recipes");
}
