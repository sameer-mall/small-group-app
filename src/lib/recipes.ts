import { asc, count, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { recipeItems, recipes } from "@/db/schema";
import { requireMembership } from "@/lib/membership";

export type Recipe = {
  id: string;
  groupId: string;
  name: string;
  createdBy: string;
  items: { id: string; label: string; position: number }[];
};

export type RecipeSummary = { id: string; name: string; itemCount: number };

// Loads the recipe and confirms the actor belongs to *its* group. Scoping the
// membership check to the recipe's own group is what stops a member of group A
// editing group B's recipe with a guessed id.
async function requireRecipeMember(userId: string, recipeId: string) {
  const [row] = await db
    .select({ id: recipes.id, groupId: recipes.groupId })
    .from(recipes)
    .where(eq(recipes.id, recipeId));
  if (!row) throw new Error("not-found");
  await requireMembership(userId, row.groupId);
  return row;
}

// Items are written as a positional list: index in the input array becomes
// `position`, which is the order getRecipe reads back.
function itemRows(recipeId: string, items: string[]) {
  return items.map((label, position) => ({ recipeId, label, position }));
}

export async function createRecipe(
  userId: string,
  groupId: string,
  input: { name: string; items: string[] },
): Promise<{ recipeId: string }> {
  await requireMembership(userId, groupId);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(recipes)
      .values({ groupId, name: input.name, createdBy: userId })
      .returning({ id: recipes.id });
    if (input.items.length > 0) {
      await tx.insert(recipeItems).values(itemRows(row.id, input.items));
    }
    return { recipeId: row.id };
  });
}

export async function listRecipes(groupId: string): Promise<RecipeSummary[]> {
  return db
    .select({
      id: recipes.id,
      name: recipes.name,
      // count() over the left-joined items; a recipe with none counts 0
      // because count ignores the null row a left join produces.
      itemCount: count(recipeItems.id),
    })
    .from(recipes)
    .leftJoin(recipeItems, eq(recipeItems.recipeId, recipes.id))
    .where(eq(recipes.groupId, groupId))
    .groupBy(recipes.id, recipes.name)
    .orderBy(asc(recipes.name));
}

export async function getRecipe(recipeId: string): Promise<Recipe | null> {
  const [recipe] = await db
    .select({
      id: recipes.id,
      groupId: recipes.groupId,
      name: recipes.name,
      createdBy: recipes.createdBy,
    })
    .from(recipes)
    .where(eq(recipes.id, recipeId));
  if (!recipe) return null;

  const items = await db
    .select({ id: recipeItems.id, label: recipeItems.label, position: recipeItems.position })
    .from(recipeItems)
    .where(eq(recipeItems.recipeId, recipeId))
    .orderBy(asc(recipeItems.position));

  return { ...recipe, items };
}

// Replaces the item list wholesale rather than diffing it: the form submits a
// full list, and positions have to stay contiguous. Meal plans copy a recipe's
// items when a meal is set (see the plan's architecture note), so rewriting
// these rows never disturbs a past week's claims.
export async function updateRecipe(
  userId: string,
  recipeId: string,
  input: { name: string; items: string[] },
): Promise<void> {
  await requireRecipeMember(userId, recipeId);
  await db.transaction(async (tx) => {
    await tx.update(recipes).set({ name: input.name }).where(eq(recipes.id, recipeId));
    await tx.delete(recipeItems).where(eq(recipeItems.recipeId, recipeId));
    if (input.items.length > 0) {
      await tx.insert(recipeItems).values(itemRows(recipeId, input.items));
    }
  });
}

export async function deleteRecipe(userId: string, recipeId: string): Promise<void> {
  await requireRecipeMember(userId, recipeId);
  // recipe_items cascade from the FK.
  await db.delete(recipes).where(eq(recipes.id, recipeId));
}
