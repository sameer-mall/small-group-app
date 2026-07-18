import { expect, test } from "@playwright/test";

test("signed-out home redirects to sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("heading", { name: "Small Group" })).toBeVisible();
});
