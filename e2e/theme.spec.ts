import { expect, test } from "@playwright/test";

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
