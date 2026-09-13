import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { approveRequest, createGroup, getInviteCode, requestToJoin } from "@/lib/groups";
import { createMeeting } from "@/lib/meetings";
import { createRecipe, updateRecipe } from "@/lib/recipes";
import {
  addAdhocItem,
  claimItem,
  getMealPlan,
  releaseItem,
  removeAdhocItem,
  setMeal,
} from "@/lib/meals";

async function mkUser(id: string, name = id) {
  await db.execute(sql`insert into "user" (id, name, email, email_verified, created_at, updated_at)
    values (${id}, ${name}, ${id + "@example.com"}, true, now(), now()) on conflict do nothing`);
  return id;
}

// Adds `userId` to `groupId` as a plain member via the real join flow.
async function addMember(adminId: string, groupId: string, userId: string) {
  await requestToJoin(userId, await getInviteCode(groupId));
  const [req] = (await db.execute(
    sql`select id from join_requests where group_id = ${groupId} and user_id = ${userId} and status = 'pending'`,
  )).rows as { id: string }[];
  await approveRequest(adminId, req.id);
}

// A group with one admin (alice), one plain member (bob), a meeting, and a
// three-item recipe — the shape every test below starts from.
async function mkGroupWithMeal(alice: string, bob: string, name: string) {
  const { groupId } = await createGroup(alice, name);
  await addMember(alice, groupId, bob);
  const { meetingId } = await createMeeting(alice, groupId, {
    title: "Taco Thursday",
    date: "2026-09-10",
  });
  const { recipeId } = await createRecipe(alice, groupId, {
    name: "Taco night",
    items: ["ground beef", "tortilla chips", "shredded cheese"],
  });
  return { groupId, meetingId, recipeId };
}

async function claim(itemId: string, userId: string) {
  await db.execute(
    sql`insert into item_claims (item_id, user_id, claimed_at) values (${itemId}, ${userId}, now())`,
  );
}

describe("meals domain", () => {
  let alice: string, bob: string, carol: string, outsider: string;
  beforeAll(async () => {
    alice = await mkUser(`u_ml_alice_${crypto.randomUUID()}`, "Alice");
    bob = await mkUser(`u_ml_bob_${crypto.randomUUID()}`, "Bob");
    carol = await mkUser(`u_ml_carol_${crypto.randomUUID()}`, "Carol");
    outsider = await mkUser(`u_ml_out_${crypto.randomUUID()}`, "Outsider");
  });

  // A group whose only member is alice, with a meal already set from a
  // three-item recipe. Tests that need a second member add one themselves —
  // unlike mkGroupWithMeal, which hands you bob already joined.
  async function seedPlan() {
    const { groupId } = await createGroup(alice, "Claiming");
    const { meetingId } = await createMeeting(alice, groupId, {
      title: "Taco Thursday",
      date: "2026-09-10",
    });
    const { recipeId } = await createRecipe(alice, groupId, {
      name: "Taco night",
      items: ["ground beef", "tortilla chips", "shredded cheese"],
    });
    await setMeal(alice, meetingId, recipeId);
    const plan = await getMealPlan(meetingId);
    return { groupId, meetingId, itemIds: plan!.items.map((i) => i.id) };
  }

  it("setting a meal copies the recipe's items in order", async () => {
    const { meetingId, recipeId } = await mkGroupWithMeal(alice, bob, "Copying");
    await setMeal(alice, meetingId, recipeId);

    const plan = await getMealPlan(meetingId);
    expect(plan).toMatchObject({ meetingId, recipeId, recipeName: "Taco night" });
    expect(plan!.items.map((i) => i.label)).toEqual([
      "ground beef",
      "tortilla chips",
      "shredded cheese",
    ]);
    expect(plan!.items.map((i) => i.position)).toEqual([0, 1, 2]);
    expect(plan!.items.every((i) => i.source === "recipe")).toBe(true);
    expect(plan!.items.every((i) => i.addedBy === null)).toBe(true);
  });

  it("returns null when no meal has been set", async () => {
    const { meetingId } = await mkGroupWithMeal(alice, bob, "No meal");
    expect(await getMealPlan(meetingId)).toBeNull();
  });

  it("editing the recipe afterwards does not change the plan", async () => {
    const { meetingId, recipeId } = await mkGroupWithMeal(alice, bob, "Copy guarantee");
    await setMeal(alice, meetingId, recipeId);

    await updateRecipe(alice, recipeId, { name: "Taco night v2", items: ["nothing but beans"] });

    const plan = await getMealPlan(meetingId);
    expect(plan!.items.map((i) => i.label)).toEqual([
      "ground beef",
      "tortilla chips",
      "shredded cheese",
    ]);
  });

  it("setting a different recipe clears the previous items and their claims", async () => {
    const { groupId, meetingId, recipeId } = await mkGroupWithMeal(alice, bob, "Replacing");
    await setMeal(alice, meetingId, recipeId);

    const before = await getMealPlan(meetingId);
    await claim(before!.items[0].id, bob);

    const { recipeId: soupId } = await createRecipe(alice, groupId, {
      name: "Soup night",
      items: ["broth", "bread"],
    });
    await setMeal(alice, meetingId, soupId);

    const after = await getMealPlan(meetingId);
    expect(after!.recipeName).toBe("Soup night");
    expect(after!.items.map((i) => i.label)).toEqual(["broth", "bread"]);
    expect(after!.items.every((i) => i.claimedBy === null)).toBe(true);

    const claims = (await db.execute(sql`select item_id from item_claims`)).rows as {
      item_id: string;
    }[];
    expect(claims.map((c) => c.item_id)).not.toContain(before!.items[0].id);
  });

  it("getMealPlan reports who claimed an item, by name", async () => {
    const { meetingId, recipeId } = await mkGroupWithMeal(alice, bob, "Claim names");
    await setMeal(alice, meetingId, recipeId);

    const plan = await getMealPlan(meetingId);
    await claim(plan!.items[1].id, bob);

    const after = await getMealPlan(meetingId);
    expect(after!.items[1]).toMatchObject({ claimedBy: bob, claimedByName: "Bob" });
    expect(after!.items[0]).toMatchObject({ claimedBy: null, claimedByName: null });
  });

  it("addAdhocItem records the adder and appends after the recipe items", async () => {
    const { meetingId, recipeId } = await mkGroupWithMeal(alice, bob, "Ad-hoc append");
    await setMeal(alice, meetingId, recipeId);

    const { itemId } = await addAdhocItem(bob, meetingId, "brownies");

    const plan = await getMealPlan(meetingId);
    expect(plan!.items.map((i) => i.label)).toEqual([
      "ground beef",
      "tortilla chips",
      "shredded cheese",
      "brownies",
    ]);
    const added = plan!.items.find((i) => i.id === itemId)!;
    expect(added).toMatchObject({
      position: 3,
      source: "adhoc",
      addedBy: bob,
      addedByName: "Bob",
    });
  });

  it("removeAdhocItem lets the member who added it remove it", async () => {
    const { meetingId, recipeId } = await mkGroupWithMeal(alice, bob, "Adder removes");
    await setMeal(alice, meetingId, recipeId);
    const { itemId } = await addAdhocItem(bob, meetingId, "brownies");

    await removeAdhocItem(bob, itemId);

    const plan = await getMealPlan(meetingId);
    expect(plan!.items.map((i) => i.label)).not.toContain("brownies");
  });

  it("removeAdhocItem lets an admin remove someone else's item", async () => {
    const { meetingId, recipeId } = await mkGroupWithMeal(alice, bob, "Admin removes");
    await setMeal(alice, meetingId, recipeId);
    const { itemId } = await addAdhocItem(bob, meetingId, "brownies");

    await removeAdhocItem(alice, itemId);

    const plan = await getMealPlan(meetingId);
    expect(plan!.items.map((i) => i.label)).not.toContain("brownies");
  });

  it("removeAdhocItem refuses another plain member", async () => {
    const { groupId, meetingId, recipeId } = await mkGroupWithMeal(alice, bob, "Other member");
    await addMember(alice, groupId, carol);
    await setMeal(alice, meetingId, recipeId);
    const { itemId } = await addAdhocItem(bob, meetingId, "brownies");

    await expect(removeAdhocItem(carol, itemId)).rejects.toThrow("forbidden");
  });

  it("removeAdhocItem refuses once the item is claimed", async () => {
    const { meetingId, recipeId } = await mkGroupWithMeal(alice, bob, "Claimed adhoc");
    await setMeal(alice, meetingId, recipeId);
    const { itemId } = await addAdhocItem(bob, meetingId, "brownies");
    await claim(itemId, alice);

    await expect(removeAdhocItem(bob, itemId)).rejects.toThrow("forbidden");
  });

  it("removeAdhocItem refuses a copied recipe item", async () => {
    const { meetingId, recipeId } = await mkGroupWithMeal(alice, bob, "Not adhoc");
    await setMeal(alice, meetingId, recipeId);
    const plan = await getMealPlan(meetingId);

    await expect(removeAdhocItem(alice, plan!.items[0].id)).rejects.toThrow("forbidden");
  });

  it("non-members cannot set a meal or add an item", async () => {
    const { meetingId, recipeId } = await mkGroupWithMeal(alice, bob, "Sealed meal");

    await expect(setMeal(outsider, meetingId, recipeId)).rejects.toThrow("forbidden");
    await setMeal(alice, meetingId, recipeId);
    await expect(addAdhocItem(outsider, meetingId, "intruder")).rejects.toThrow("forbidden");
  });

  it("a recipe from another group cannot be planted in this meeting", async () => {
    const { meetingId } = await mkGroupWithMeal(alice, bob, "Target group");
    const { groupId: otherGroupId } = await createGroup(carol, "Other group");
    const { recipeId: foreignRecipeId } = await createRecipe(carol, otherGroupId, {
      name: "Foreign",
      items: ["x"],
    });

    await expect(setMeal(alice, meetingId, foreignRecipeId)).rejects.toThrow("not-found");
  });

  it("setMeal throws not-found for a meeting that does not exist", async () => {
    const { recipeId } = await mkGroupWithMeal(alice, bob, "Missing meeting");
    await expect(setMeal(alice, crypto.randomUUID(), recipeId)).rejects.toThrow("not-found");
  });
  it("one member claims an item; a second claimer is rejected", async () => {
    const { groupId, meetingId, itemIds } = await seedPlan();
    await addMember(alice, groupId, bob);

    await claimItem(alice, itemIds[0]);
    await expect(claimItem(bob, itemIds[0])).rejects.toThrow("already-claimed");

    const plan = await getMealPlan(meetingId);
    expect(plan!.items[0].claimedBy).toBe(alice);
  });

  it("exactly one of many simultaneous claims wins", async () => {
    const { groupId, meetingId, itemIds } = await seedPlan();
    await addMember(alice, groupId, bob);
    await addMember(alice, groupId, carol);

    // Fire concurrently: the DB primary key is the arbiter, not app logic.
    //
    // Width matters here. At three claimers a pre-check implementation
    // ("SELECT, then INSERT if free") passes this test too, because the first
    // insert lands before the other two run their SELECT — so three proves
    // nothing. Measured at eight, that implementation leaks a raw duplicate-key
    // error instead of "already-claimed" in 24 of 25 runs. Eight over three
    // members is realistic besides: a phone double-tap repeats one member.
    const claimers = [alice, bob, carol, alice, bob, carol, alice, bob];
    const results = await Promise.allSettled(
      claimers.map((claimer) => claimItem(claimer, itemIds[0])),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const rejected of results.filter((r) => r.status === "rejected")) {
      expect((rejected as PromiseRejectedResult).reason.message).toBe("already-claimed");
    }

    const plan = await getMealPlan(meetingId);
    expect(plan!.items[0].claimedBy).not.toBeNull();
  });

  it("only the claimer can release; releasing a free item throws", async () => {
    const { groupId, itemIds } = await seedPlan();
    await addMember(alice, groupId, bob);

    await claimItem(alice, itemIds[0]);
    await expect(releaseItem(bob, itemIds[0])).rejects.toThrow("not-claimed");
    await releaseItem(alice, itemIds[0]);
    await expect(releaseItem(alice, itemIds[0])).rejects.toThrow("not-claimed");
  });

  it("a non-member cannot claim", async () => {
    const { itemIds } = await seedPlan();
    await expect(claimItem(outsider, itemIds[0])).rejects.toThrow("forbidden");
  });

  it("claiming a item that does not exist throws not-found", async () => {
    await expect(claimItem(alice, crypto.randomUUID())).rejects.toThrow("not-found");
  });

  it("a released item can be claimed again, by someone else", async () => {
    const { groupId, meetingId, itemIds } = await seedPlan();
    await addMember(alice, groupId, bob);

    await claimItem(alice, itemIds[0]);
    await releaseItem(alice, itemIds[0]);
    await claimItem(bob, itemIds[0]);

    const plan = await getMealPlan(meetingId);
    expect(plan!.items[0]).toMatchObject({ claimedBy: bob, claimedByName: "Bob" });
  });
});
