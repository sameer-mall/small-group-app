import { expect, test } from "@playwright/test";
import { expectApp, memberContext, signIn } from "./helpers";

test("the Settings tab holds the personal controls, and What's new leads back to it", async ({ browser }) => {
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

  // Settings is its own tab: lit while open, with no Back.
  await page.getByRole("link", { name: "Settings" }).click();
  await expectApp(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByText(`settings-${run}@example.com`)).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Appearance" })).toBeVisible();
  // Headless Chromium has PushManager and permission "default": the toggle is off.
  const toggle = page.getByRole("switch", { name: "Notify me on this device" });
  await expectApp(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings", exact: true })).toHaveClass(
    /text-accent-strong/,
  );
  await expect(page.getByRole("link", { name: /^Back/ })).toHaveCount(0);

  // What's new sits under it, and Back returns there.
  await page.getByRole("link", { name: /What's new/ }).click();
  await expect(page).toHaveURL(/\/settings\/whats-new$/);
  await page.getByRole("link", { name: "Back to Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expectApp(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
});
