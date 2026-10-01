import { expect, test } from "@playwright/test";
import { expectApp, memberContext, signIn } from "./helpers";

test("set a meal from a recipe, then claim and release an item", async ({ browser }) => {
  // Unique per run so repeated local runs never collide on group or recipe
  // names — the database is not reset between runs.
  const run = Date.now();
  const recipeName = `Taco night ${run}`;
  const meetingTitle = `Taco Thursday ${run}`;

  const alice = await (await memberContext(browser)).newPage();
  await signIn(alice, `meals-alice-${run}@example.com`, "Alice");

  await alice.getByRole("link", { name: "Create a group" }).click();
  await alice.getByLabel("Group name").fill(`Supper ${run}`);
  await alice.getByRole("button", { name: "Create group" }).click();
  await expectApp(alice.getByRole("heading", { name: `Supper ${run}` })).toBeVisible();

  // A recipe with two items — enough to tell "the one I claimed" from "the
  // rest" without making the assertions depend on ordering.
  await alice.getByRole("link", { name: "Recipes" }).click();
  await alice.getByRole("link", { name: "Add a recipe" }).click();
  await alice.getByPlaceholder("Recipe name").fill(recipeName);
  await alice.getByRole("button", { name: "Add item" }).click();
  const items = alice.getByPlaceholder("What someone brings");
  await items.nth(0).fill("ground beef");
  await items.nth(1).fill("tortilla chips");
  await alice.getByRole("button", { name: "Save recipe" }).click();
  await expectApp(alice.getByText(recipeName)).toBeVisible();

  await alice.getByRole("link", { name: "Meetings" }).click();
  await alice.getByRole("button", { name: "Plan a meeting" }).click();
  await alice.getByPlaceholder("Meeting title").fill(meetingTitle);
  await alice.locator('input[name="date"]').fill("2026-10-01");
  await alice.getByRole("button", { name: "Create meeting" }).click();
  await expectApp(alice.getByRole("link", { name: new RegExp(meetingTitle) })).toBeVisible();

  await alice.getByRole("link", { name: new RegExp(meetingTitle) }).click();
  await expectApp(alice.getByText("No meal planned yet")).toBeVisible();

  // Setting the meal copies the recipe's items in as claimable slots.
  await alice.getByRole("button", { name: "Pick a recipe" }).click();
  await alice.getByRole("button", { name: new RegExp(recipeName) }).click();
  await expectApp(alice.getByRole("button", { name: "Claim" })).toHaveCount(2);

  await alice.getByRole("button", { name: "Claim" }).first().click();
  await expectApp(alice.getByRole("button", { name: "Release" })).toBeVisible();
  // Scoped to the meal section: the meeting page also renders the prayer
  // bowl, whose buckets list the viewer as "You" too.
  await expectApp(
    alice.locator("section").filter({ hasText: recipeName }).getByText("You", { exact: true }),
  ).toBeVisible();
  await expectApp(alice.getByRole("button", { name: "Claim" })).toHaveCount(1);

  await alice.getByRole("button", { name: "Release" }).click();
  await expectApp(alice.getByRole("button", { name: "Claim" })).toHaveCount(2);
  await expect(alice.getByRole("button", { name: "Release" })).toHaveCount(0);
});
