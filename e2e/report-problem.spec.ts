import { expect, test } from "@playwright/test";
import { expectApp, memberContext, signIn } from "./helpers";

test("a member reports a problem from Settings", async ({ browser }) => {
  const run = Date.now();
  const page = await (await memberContext(browser)).newPage();
  await signIn(page, `reporter-${run}@example.com`, "Reporter");
  await page.getByRole("link", { name: "Create a group" }).click();
  await page.getByLabel("Group name").fill(`Reports ${run}`);
  await page.getByRole("button", { name: "Create group" }).click();
  await expectApp(page.getByText(`Reports ${run}`)).toBeVisible();

  await page.getByRole("link", { name: "Group" }).click();
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Report a problem" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Send report" })).toBeDisabled();

  await dialog.getByLabel("What happened?").fill("The meal list didn't load.");
  await dialog.getByRole("button", { name: "Send report" }).click();
  await expect(dialog.getByText("Thanks for letting us know")).toBeVisible();

  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
});
