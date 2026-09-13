import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { createGroup } from "@/lib/groups";
import {
  createRecipe, deleteRecipe, getRecipe, listRecipes, updateRecipe,
} from "@/lib/recipes";

async function mkUser(id: string, name = id) {
  await db.execute(sql`insert into "user" (id, name, email, email_verified, created_at, updated_at)
    values (${id}, ${name}, ${id + "@example.com"}, true, now(), now()) on conflict do nothing`);
  return id;
}

describe("recipes domain", () => {
  let alice: string, outsider: string;
  beforeAll(async () => {
    alice = await mkUser(`u_r_alice_${crypto.randomUUID()}`, "Alice");
    outsider = await mkUser(`u_r_out_${crypto.randomUUID()}`, "Outsider");
  });

  it("creates a recipe with ordered items and reads it back", async () => {
    const { groupId } = await createGroup(alice, "Cooks");
    const { recipeId } = await createRecipe(alice, groupId, {
      name: "Taco night",
      items: ["2 lbs ground beef", "3 bags tortilla chips", "shredded cheese"],
    });

    const recipe = await getRecipe(recipeId);
    expect(recipe).toMatchObject({ groupId, name: "Taco night", createdBy: alice });
    expect(recipe!.items.map((i) => i.label)).toEqual([
      "2 lbs ground beef", "3 bags tortilla chips", "shredded cheese",
    ]);
    expect(recipe!.items.map((i) => i.position)).toEqual([0, 1, 2]);
  });

  it("lists a group's recipes by name with an item count", async () => {
    const { groupId } = await createGroup(alice, "Listing");
    await createRecipe(alice, groupId, { name: "Zucchini bake", items: ["zucchini"] });
    await createRecipe(alice, groupId, { name: "Apple crisp", items: ["apples", "oats"] });

    const list = await listRecipes(groupId);
    expect(list.map((r) => r.name)).toEqual(["Apple crisp", "Zucchini bake"]);
    expect(list.map((r) => r.itemCount)).toEqual([2, 1]);
  });

  it("updating replaces the whole item list", async () => {
    const { groupId } = await createGroup(alice, "Editing");
    const { recipeId } = await createRecipe(alice, groupId, {
      name: "Chili", items: ["beans", "beef"],
    });
    await updateRecipe(alice, recipeId, { name: "Chili (v2)", items: ["beans", "beef", "cornbread"] });

    const recipe = await getRecipe(recipeId);
    expect(recipe!.name).toBe("Chili (v2)");
    expect(recipe!.items.map((i) => i.label)).toEqual(["beans", "beef", "cornbread"]);
  });

  it("non-members cannot create, edit, or delete", async () => {
    const { groupId } = await createGroup(alice, "Sealed recipes");
    const { recipeId } = await createRecipe(alice, groupId, { name: "Secret", items: ["x"] });

    await expect(
      createRecipe(outsider, groupId, { name: "Intruder", items: ["y"] }),
    ).rejects.toThrow("forbidden");
    await expect(
      updateRecipe(outsider, recipeId, { name: "Hijacked", items: ["y"] }),
    ).rejects.toThrow("forbidden");
    await expect(deleteRecipe(outsider, recipeId)).rejects.toThrow("forbidden");
  });

  it("deleting removes the recipe and its items", async () => {
    const { groupId } = await createGroup(alice, "Deleting");
    const { recipeId } = await createRecipe(alice, groupId, { name: "Gone", items: ["a", "b"] });
    await deleteRecipe(alice, recipeId);

    expect(await getRecipe(recipeId)).toBeNull();
    const rows = (await db.execute(
      sql`select id from recipe_items where recipe_id = ${recipeId}`,
    )).rows;
    expect(rows).toHaveLength(0);
  });
});
