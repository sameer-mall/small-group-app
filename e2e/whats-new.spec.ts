import { expect, test } from "@playwright/test";
import { expectApp, memberContext, resetWhatsNewSeen, signIn } from "./helpers";
import { releases } from "../src/lib/whats-new";

test("a member who is behind sees what's new once, then finds it on the Group screen", async ({
  browser,
}) => {
  const run = Date.now();
  const email = `whats-new-${run}@example.com`;
  const page = await (await memberContext(browser)).newPage();
  await signIn(page, email, "Reader");
  await page.getByRole("link", { name: "Create a group" }).click();
  await page.getByLabel("Group name").fill(`News ${run}`);
  await page.getByRole("button", { name: "Create group" }).click();
  await expectApp(page.getByText(`News ${run}`)).toBeVisible();
  // A new account starts caught up.
  await expect(page.getByRole("dialog")).toBeHidden();

  await resetWhatsNewSeen(email);
  await page.reload();
  const dialog = page.getByRole("dialog", { name: "What's new" });
  await expectApp(dialog).toBeVisible();
  for (const { title } of releases.slice(0, 3)) {
    await expect(dialog.getByText(title)).toBeVisible();
  }

  // The save runs in the background after the dialog closes; let it land
  // before reloading, or the reload could cancel it.
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && !!response.request().headers()["next-action"],
  );
  await dialog.getByRole("button", { name: "Got it" }).click();
  await expect(dialog).toBeHidden();
  await saved;

  await page.reload();
  await expectApp(page.getByText(`News ${run}`)).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.getByRole("link", { name: "Group" }).click();
  await page.getByRole("link", { name: /What's new/ }).click();
  await expect(page).toHaveURL(/\/group\/whats-new$/);
  await expectApp(page.getByRole("heading", { name: "What's new" })).toBeVisible();
  for (const { title } of releases) {
    await expect(page.getByText(title)).toBeVisible();
  }
});
