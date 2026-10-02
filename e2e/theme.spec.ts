import { expect, test } from "@playwright/test";
import { expectApp, memberContext, signIn } from "./helpers";

// Hearth's palettes hang off data-theme on <html>, which next-themes sets from
// prefers-color-scheme before first paint. Without it the app is stuck in
// light mode no matter what the device prefers.
const SCHEMES = [
  { colorScheme: "light", background: "rgb(250, 245, 236)" }, // --bg #FAF5EC
  { colorScheme: "dark", background: "rgb(32, 25, 20)" }, // --bg #201914
] as const;

for (const { colorScheme, background } of SCHEMES) {
  test.describe(`${colorScheme} system theme`, () => {
    test.use({ colorScheme });

    test("sign-in renders the matching Hearth palette", async ({ page }) => {
      await page.goto("/sign-in");
      await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
      await expect(page.locator("body")).toHaveCSS("background-color", background);
    });
  });
}

test("the Group page's appearance choice overrides the system theme and sticks", async ({ browser }) => {
  const run = Date.now();
  const page = await (await memberContext(browser, { colorScheme: "dark" })).newPage();
  await signIn(page, `theme-${run}@example.com`, "Theo");
  await page.getByRole("link", { name: "Create a group" }).click();
  await page.getByLabel("Group name").fill(`Theme ${run}`);
  await page.getByRole("button", { name: "Create group" }).click();
  await expectApp(page.getByRole("heading", { name: `Theme ${run}` })).toBeVisible();
  await page.getByRole("link", { name: "Group" }).click();

  const appearance = page.getByRole("radiogroup", { name: "Appearance" });
  await expectApp(appearance.getByRole("radio", { name: "System" })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await appearance.getByRole("radio", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(250, 245, 236)");
  await expect(appearance.getByRole("radio", { name: "Light" })).toBeChecked();

  await appearance.getByRole("radio", { name: "System" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
