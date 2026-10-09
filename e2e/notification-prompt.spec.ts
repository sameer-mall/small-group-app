import { expect, test } from "@playwright/test";
import { expectApp, fakeInstalledApp, memberContext, resetWhatsNewSeen, signIn } from "./helpers";

async function newGroup(page: import("@playwright/test").Page, name: string) {
  await page.getByRole("link", { name: "Create a group" }).click();
  await page.getByLabel("Group name").fill(name);
  await page.getByRole("button", { name: "Create group" }).click();
  await expectApp(page.getByRole("heading", { name })).toBeVisible();
}

test("an installed app asks once to turn notifications on", async ({ browser }) => {
  const run = Date.now();
  const context = await memberContext(browser);
  await fakeInstalledApp(context);
  const page = await context.newPage();
  await signIn(page, `prompt-${run}@example.com`, "Prompted");

  // The first page after sign-in is the first launch; no group needed.
  const dialog = page.getByRole("dialog", { name: "Hear about meals and meetings" });
  await expectApp(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Turn on notifications" })).toBeVisible();
  await dialog.getByRole("button", { name: "Not now" }).click();
  await expect(dialog).toBeHidden();

  // Declined once is declined for good on this device.
  await newGroup(page, `Prompt ${run}`);
  await page.reload();
  await expectApp(page.getByRole("heading", { name: `Prompt ${run}` })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a browser tab is never asked", async ({ browser }) => {
  const run = Date.now();
  const page = await (await memberContext(browser)).newPage();
  await signIn(page, `tab-${run}@example.com`, "Tabbed");
  await newGroup(page, `Tab ${run}`);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the ask waits while What's new is showing", async ({ browser }) => {
  const run = Date.now();
  const email = `behind-${run}@example.com`;
  const context = await memberContext(browser);
  await fakeInstalledApp(context);
  const page = await context.newPage();
  await signIn(page, email, "Behind");
  await page
    .getByRole("dialog", { name: "Hear about meals and meetings" })
    .getByRole("button", { name: "Not now" })
    .click();
  await newGroup(page, `Behind ${run}`);
  // Forget the decline so the ask is eligible again, then fall behind on What's new.
  await page.evaluate(() => window.localStorage.removeItem("small-group:notification-prompt"));
  await resetWhatsNewSeen(email);

  await page.reload();
  const whatsNew = page.getByRole("dialog", { name: "What's new" });
  await expectApp(whatsNew).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Hear about meals and meetings" })).toHaveCount(0);
  await whatsNew.getByRole("button", { name: "Got it" }).click();
  await expect(whatsNew).toBeHidden();

  // Next launch, caught up on What's new, the ask comes through.
  await page.reload();
  await expectApp(page.getByRole("dialog", { name: "Hear about meals and meetings" })).toBeVisible();
});
