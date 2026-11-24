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
  // Scoped to the meal section so "You" can't match anything else on the
  // meeting page. The meeting page no longer renders the wall's rows, so this
  // scoping is kept defensively.
  await expectApp(
    alice.locator("section").filter({ hasText: recipeName }).getByText("You", { exact: true }),
  ).toBeVisible();
  await expectApp(alice.getByRole("button", { name: "Claim" })).toHaveCount(1);

  await alice.getByRole("button", { name: "Release" }).click();
  await expectApp(alice.getByRole("button", { name: "Claim" })).toHaveCount(2);
  await expect(alice.getByRole("button", { name: "Release" })).toHaveCount(0);
});

// Every meal save notifies the whole group, so a picker that saves twice
// sends two identical notifications (one member once got four).
test("a burst of taps saves the meal once, and Change recipe won't re-pick the current one", async ({
  browser,
}) => {
  const run = Date.now();
  const pasta = `Pasta ${run}`;
  const tacos = `Tacos ${run}`;
  const meetingTitle = `Week 4 ${run}`;

  const alice = await (await memberContext(browser)).newPage();
  await signIn(alice, `meals-repick-${run}@example.com`, "Alice");

  await alice.getByRole("link", { name: "Create a group" }).click();
  await alice.getByLabel("Group name").fill(`Repick ${run}`);
  await alice.getByRole("button", { name: "Create group" }).click();
  await expectApp(alice.getByRole("heading", { name: `Repick ${run}` })).toBeVisible();

  for (const [name, item] of [
    [pasta, "noodles"],
    [tacos, "shells"],
  ]) {
    await alice.getByRole("link", { name: "Recipes" }).click();
    await alice.getByRole("link", { name: "Add a recipe" }).click();
    await alice.getByPlaceholder("Recipe name").fill(name);
    await alice.getByPlaceholder("What someone brings").fill(item);
    await alice.getByRole("button", { name: "Save recipe" }).click();
    await expectApp(alice.getByText(name)).toBeVisible();
  }

  await alice.getByRole("link", { name: "Meetings" }).click();
  await alice.getByRole("button", { name: "Plan a meeting" }).click();
  await alice.getByPlaceholder("Meeting title").fill(meetingTitle);
  await alice.locator('input[name="date"]').fill("2026-10-27");
  await alice.getByRole("button", { name: "Create meeting" }).click();
  await alice.getByRole("link", { name: new RegExp(meetingTitle) }).click();
  await expectApp(alice.getByText("No meal planned yet")).toBeVisible();

  // Four taps in the same instant, faster than the list can re-render as
  // disabled. Server actions are POSTs carrying a Next-Action header.
  let saves = 0;
  alice.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) saves++;
  });
  await alice.getByRole("button", { name: "Pick a recipe" }).click();
  const pastaChoice = alice.getByRole("dialog").getByRole("button", { name: new RegExp(pasta) });
  await pastaChoice.evaluate((button: HTMLButtonElement) => {
    for (let i = 0; i < 4; i++) button.click();
  });
  await expectApp(alice.getByRole("dialog")).toHaveCount(0);
  await expectApp(alice.getByRole("button", { name: "Claim" })).toHaveCount(1);
  // A queued tap would only send once the first save returned, so let the
  // network settle before counting.
  await alice.waitForLoadState("networkidle");
  expect(saves).toBe(1);

  await alice.getByRole("button", { name: "Claim" }).click();
  await expectApp(alice.getByRole("button", { name: "Release" })).toBeVisible();

  // The current recipe is marked and can't be picked; the others can.
  await alice.getByRole("button", { name: "Change recipe", exact: true }).click();
  const dialog = alice.getByRole("dialog");
  await expectApp(dialog.getByRole("button", { name: new RegExp(`${pasta}.*Current`) })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: new RegExp(tacos) })).toBeEnabled();

  // Backing out leaves the meal, and Alice's claim, alone.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expectApp(alice.getByRole("dialog")).toHaveCount(0);
  await expect(alice.getByRole("button", { name: "Release" })).toBeVisible();

  // A different recipe still replaces the meal, clearing the claim.
  await alice.getByRole("button", { name: "Change recipe", exact: true }).click();
  await alice.getByRole("dialog").getByRole("button", { name: new RegExp(tacos) }).click();
  await expectApp(alice.getByRole("heading", { name: tacos })).toBeVisible();
  await expectApp(alice.getByRole("button", { name: "Claim" })).toHaveCount(1);
  await expect(alice.getByRole("button", { name: "Release" })).toHaveCount(0);

  await alice.getByRole("button", { name: "Change recipe", exact: true }).click();
  await expectApp(
    alice.getByRole("dialog").getByRole("button", { name: new RegExp(`${tacos}.*Current`) }),
  ).toBeDisabled();
});
