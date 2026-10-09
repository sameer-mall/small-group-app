import { expect, test } from "@playwright/test";
import { expectApp, memberContext, signIn } from "./helpers";

test("a new display name shows on meal claims, the prayer bowl, and the member list", async ({ browser }) => {
  const run = Date.now();
  const recipeName = `Soup night ${run}`;
  const meetingTitle = `Week ${run}`;
  const newName = `Alicia ${run}`;
  // Today, so the meeting page renders the open prayer bowl.
  const today = new Date().toLocaleDateString("en-CA");
  // No service workers: their update checks fetch /serwist/sw.js on their
  // own, and would race the cache check below.
  const options = { serviceWorkers: "block" as const };

  const alice = await (await memberContext(browser, options)).newPage();
  await signIn(alice, `rename-alice-${run}@example.com`, "Alice");
  await alice.getByRole("link", { name: "Create a group" }).click();
  await alice.getByLabel("Group name").fill(`Rename ${run}`);
  await alice.getByRole("button", { name: "Create group" }).click();
  await expectApp(alice.getByRole("heading", { name: `Rename ${run}` })).toBeVisible();

  // Bob joins through the invite link; Alice approves.
  await alice.getByRole("link", { name: "Group" }).click();
  const inviteUrl = await alice.getByTestId("invite-url").innerText();
  const bob = await (await memberContext(browser, options)).newPage();
  await signIn(bob, `rename-bob-${run}@example.com`, "Bob");
  await bob.goto(new URL(inviteUrl).pathname);
  await bob.getByRole("button", { name: "Ask to join" }).click();
  await expectApp(bob.getByText("Waiting for approval")).toBeVisible();
  await alice.reload();
  await alice.getByRole("button", { name: "Approve" }).click();
  await expectApp(alice.getByTestId("member-row").filter({ hasText: "Bob" })).toBeVisible();

  // A one-item recipe for the meal Alice claims from.
  await alice.getByRole("link", { name: "Recipes" }).click();
  await alice.getByRole("link", { name: "Add a recipe" }).click();
  await alice.getByPlaceholder("Recipe name").fill(recipeName);
  await alice.getByPlaceholder("What someone brings").fill("bread");
  await alice.getByRole("button", { name: "Save recipe" }).click();
  await expectApp(alice.getByText(recipeName)).toBeVisible();

  await alice.getByRole("link", { name: "Meetings" }).click();
  await alice.getByRole("button", { name: "Plan a meeting" }).click();
  await alice.getByPlaceholder("Meeting title").fill(meetingTitle);
  await alice.locator('input[name="date"]').fill(today);
  await alice.getByRole("button", { name: "Create meeting" }).click();
  const meetingLink = alice.getByRole("link", { name: new RegExp(meetingTitle) });
  await expectApp(meetingLink).toBeVisible();
  await meetingLink.click();
  await alice.getByRole("button", { name: "Pick a recipe" }).click();
  await alice.getByRole("button", { name: new RegExp(recipeName) }).click();
  const aliceMeal = alice.locator("section").filter({ hasText: recipeName });
  await aliceMeal.getByRole("button", { name: "Claim" }).click();
  await expectApp(aliceMeal.getByRole("button", { name: "Release" })).toBeVisible();
  // An ad-hoc item is the one place Alice reads her own name off this screen.
  await alice.getByLabel("Bringing something else?").fill("brownies");
  await alice.getByRole("button", { name: "Add item" }).click();
  await expectApp(aliceMeal.getByText("added by Alice", { exact: true })).toBeVisible();
  const meetingPath = new URL(alice.url()).pathname;

  // Bob sees her by name on the meal, in the bowl, and on the member list.
  await bob.goto(meetingPath);
  const bobMeal = bob.locator("section").filter({ hasText: recipeName });
  await expectApp(bobMeal.getByText("Alice", { exact: true })).toBeVisible();
  await expectApp(bobMeal.getByText("added by Alice", { exact: true })).toBeVisible();
  await expectApp(bob.getByText("You, Alice", { exact: true })).toBeVisible();
  await bob.getByRole("link", { name: "Group" }).click();
  await expectApp(bob.getByTestId("member-row").filter({ hasText: "Alice" })).toBeVisible();

  // Alice renames herself from Settings.
  await alice.getByRole("link", { name: "Group" }).click();
  await alice.getByRole("link", { name: "Settings" }).click();
  await alice.getByRole("button", { name: "Edit name" }).click();
  await alice.getByRole("dialog").getByRole("textbox").fill(newName);
  await alice.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(alice.getByRole("dialog")).toHaveCount(0);
  await expectApp(alice.getByText(newName, { exact: true })).toBeVisible();

  // Revalidating the (app) layout leaves the static service worker alone
  // (SMALL-GROUP-7). Had the rename expired its tags, this first request since
  // would rebuild sw.js on the spot and report a MISS.
  const sw = await alice.request.get("/serwist/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["x-nextjs-cache"]).toBe("HIT");

  // Her own meeting page, reached client-side, picks the new name up.
  await alice.getByRole("link", { name: "Meetings" }).click();
  await alice.getByRole("link", { name: new RegExp(meetingTitle) }).click();
  await expectApp(aliceMeal.getByText(`added by ${newName}`, { exact: true })).toBeVisible();

  // And so does every screen Bob moves to.
  await bob.getByRole("link", { name: "Meetings" }).click();
  await bob.getByRole("link", { name: new RegExp(meetingTitle) }).click();
  await expectApp(bobMeal.getByText(newName, { exact: true })).toBeVisible();
  await expectApp(bobMeal.getByText(`added by ${newName}`, { exact: true })).toBeVisible();
  await expectApp(bob.getByText(`You, ${newName}`, { exact: true })).toBeVisible();
  await bob.getByRole("link", { name: "Group" }).click();
  await expectApp(bob.getByTestId("member-row").filter({ hasText: newName })).toBeVisible();
});
