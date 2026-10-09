import { expect, test } from "@playwright/test";
import { expectApp, memberContext, signIn } from "./helpers";

test("the gear on the Group tab opens Settings with the personal controls", async ({ browser }) => {
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

  await page.getByRole("link", { name: "Settings" }).click();
  await expectApp(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText(`settings-${run}@example.com`)).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Appearance" })).toBeVisible();
  // Headless Chromium has PushManager and permission "default": the toggle is off.
  const toggle = page.getByRole("switch", { name: "Notify me on this device" });
  await expectApp(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  // The Group tab stays lit while on Settings.
  await expect(page.getByRole("link", { name: "Group" })).toHaveClass(/text-accent-strong/);
});
