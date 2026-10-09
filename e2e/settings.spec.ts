import { expect, test } from "@playwright/test";
import { expectApp, fakeInstalledApp, memberContext, signIn } from "./helpers";

test("the gear on the Group tab opens Settings with the personal controls", async ({ browser }) => {
  const run = Date.now();
  // Headless Chromium reports notification permission as "denied", which
  // would render the toggle disabled; the helper fakes an undecided device.
  const context = await memberContext(browser);
  await fakeInstalledApp(context);
  const page = await context.newPage();
  await signIn(page, `settings-${run}@example.com`, "Sam");
  // The faked installed app asks about notifications first; decline it here.
  await page.getByRole("dialog").getByRole("button", { name: "Not now" }).click();
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
  // PushManager exists and nothing is subscribed: the toggle is off and live.
  const toggle = page.getByRole("switch", { name: "Notify me on this device" });
  await expectApp(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(toggle).toBeEnabled();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  // The Group tab stays lit while on Settings.
  await expect(page.getByRole("link", { name: "Group" })).toHaveClass(/text-accent-strong/);
});
