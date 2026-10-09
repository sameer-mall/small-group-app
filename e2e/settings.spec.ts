import { expect, test } from "@playwright/test";
import { expectApp, memberContext, signIn } from "./helpers";

test("the gear on any tab opens Settings, and Back returns to that tab", async ({ browser }) => {
  const run = Date.now();
  const page = await (await memberContext(browser)).newPage();
  await signIn(page, `settings-${run}@example.com`, "Sam");
  await page.getByRole("link", { name: "Create a group" }).click();
  await page.getByLabel("Group name").fill(`Settings ${run}`);
  await page.getByRole("button", { name: "Create group" }).click();
  await expectApp(page.getByRole("heading", { name: `Settings ${run}` })).toBeVisible();

  await page.getByRole("link", { name: "Group" }).click();
  // The personal cards have left the Group screen.
  await expectApp(page.getByTestId("member-row")).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Appearance" })).toHaveCount(0);

  // The gear is on every tab, not only Group.
  await page.getByRole("link", { name: "Recipes" }).click();
  await expectApp(page.getByRole("heading", { name: "Recipes" })).toBeVisible();
  await page.getByRole("link", { name: "Settings" }).click();
  await expectApp(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText(`settings-${run}@example.com`)).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Appearance" })).toBeVisible();
  // Headless Chromium has PushManager and permission "default": the toggle is off.
  const toggle = page.getByRole("switch", { name: "Notify me on this device" });
  await expectApp(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  // Settings belongs to no tab, so none is lit.
  await expect(page.getByRole("link", { name: "Recipes", exact: true })).not.toHaveClass(
    /text-accent-strong/,
  );
  await expect(page.getByRole("link", { name: "Group", exact: true })).not.toHaveClass(
    /text-accent-strong/,
  );

  // A side trip to What's new keeps the way back to Recipes.
  await page.getByRole("link", { name: /What's new/ }).click();
  await expect(page).toHaveURL(/\/settings\/whats-new$/);
  await page.getByRole("link", { name: "Back to Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole("link", { name: "Back to Recipes" }).click();
  await expect(page).toHaveURL(/\/recipes$/);
  await expectApp(page.getByRole("heading", { name: "Recipes" })).toBeVisible();
});
