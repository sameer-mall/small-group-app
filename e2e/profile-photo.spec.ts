import sharp from "sharp";
import { expect, test, type Page } from "@playwright/test";
import { expectApp, latestCode, memberContext, requestCode, signIn } from "./helpers";

// A photo wide enough that the cropper has something to frame.
async function photo() {
  return {
    name: "me.png",
    mimeType: "image/png",
    buffer: await sharp({ create: { width: 600, height: 400, channels: 3, background: "#4466cc" } })
      .png()
      .toBuffer(),
  };
}

// signIn() fills the name on Welcome; this test wants to stop there.
async function signInToWelcome(page: Page, email: string) {
  await requestCode(page, email);
  await page.getByLabel("Sign-in code").fill(latestCode(email));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/welcome/);
}

test("a member adds a photo on Welcome, the group sees it, and removing it brings initials back", async ({
  browser,
}) => {
  const run = Date.now();
  const ana = await (await memberContext(browser)).newPage();

  // Welcome: the photo first, then the name.
  await signInToWelcome(ana, `photo-ana-${run}@example.com`);
  await ana.getByLabel("Choose a photo").setInputFiles(await photo());
  const dialog = ana.getByRole("dialog", { name: "Frame your photo" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Use photo" }).click();
  await expect(dialog).toBeHidden();
  // The upload lands and the page re-renders with the stored photo.
  await expectApp(ana.getByRole("button", { name: "Change photo" })).toBeVisible();
  await expect(ana.locator("main img")).toHaveAttribute("src", /^data:image\/webp;base64,/);
  await ana.getByLabel("Display name").fill("Ana Novak");
  await ana.getByRole("button", { name: "Continue" }).click();
  await ana.waitForURL((url) => url.pathname !== "/welcome");

  await ana.getByRole("link", { name: "Create a group" }).click();
  await ana.getByLabel("Group name").fill(`Photos ${run}`);
  await ana.getByRole("button", { name: "Create group" }).click();
  await expectApp(ana.getByRole("heading", { name: `Photos ${run}` })).toBeVisible();

  // Settings shows it with both controls.
  await ana.getByRole("link", { name: "Settings" }).click();
  await expectApp(ana.getByRole("button", { name: "Change photo" })).toBeVisible();
  await expect(ana.getByRole("button", { name: "Remove photo" })).toBeVisible();

  // Ben joins and sees Ana's photo on the member list.
  await ana.getByRole("link", { name: "Group" }).click();
  const inviteUrl = await ana.getByTestId("invite-url").innerText();
  const ben = await (await memberContext(browser)).newPage();
  await signIn(ben, `photo-ben-${run}@example.com`, "Ben");
  await ben.goto(new URL(inviteUrl).pathname);
  await ben.getByRole("button", { name: "Ask to join" }).click();
  await expectApp(ben.getByText("Waiting for approval")).toBeVisible();
  await ana.reload();
  await ana.getByRole("button", { name: "Approve" }).click();
  await expectApp(ana.getByTestId("member-row").filter({ hasText: "Ben" })).toBeVisible();
  await ben.getByRole("link", { name: "Group" }).click();
  const anaRow = ben.getByTestId("member-row").filter({ hasText: "Ana Novak" });
  await expectApp(anaRow.locator("img")).toBeVisible();

  // Ana removes it; Ben sees initials.
  await ana.getByRole("link", { name: "Settings" }).click();
  await ana.getByRole("button", { name: "Remove photo" }).click();
  await expectApp(ana.getByRole("button", { name: "Add a photo" })).toBeVisible();
  await ben.reload();
  await expectApp(anaRow).toBeVisible();
  await expect(anaRow.locator("img")).toHaveCount(0);
  await expect(anaRow.getByText("AN", { exact: true })).toBeVisible();
});
