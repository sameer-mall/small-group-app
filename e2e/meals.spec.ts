import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const MAIL = ".e2e-mail.jsonl";

// Same rationale as e2e/auth-groups.spec.ts: every assertion here follows a
// server action + revalidatePath, a round trip that has been observed to take
// seconds under worker load. Copied rather than imported — spec files stay
// self-contained.
const expectApp = expect.configure({ timeout: 10_000 });

async function signIn(page: Page, email: string, name: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  // The code step only renders after the send call returns, and the file
  // transport writes before it does — so the code is on disk by now.
  await expectApp(page.getByLabel("Sign-in code")).toBeVisible();
  // Pick the newest code addressed to *this* email, not simply the last line.
  // Spec files run in parallel and share one mailbox file, so "the last line"
  // is whichever worker wrote most recently — which silently signs this page
  // in as somebody else's user.
  const mail = readFileSync(MAIL, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { to: string; otp?: string })
    .findLast((mail) => mail.to === email && mail.otp);
  if (!mail?.otp) throw new Error(`no sign-in code for ${email} in ${MAIL}`);
  await page.getByLabel("Sign-in code").fill(mail.otp);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // Sign-in navigates client-side; wait until it has left /sign-in before
  // deciding whether this is a first-time user landing on /welcome.
  await page.waitForURL((url) => url.pathname !== "/sign-in");
  if (page.url().includes("/welcome")) {
    await page.getByLabel("Display name").fill(name);
    await page.getByRole("button", { name: "Continue" }).click();
  }
}

test("set a meal from a recipe, then claim and release an item", async ({ browser }) => {
  // Unique per run so repeated local runs never collide on group or recipe
  // names — the database is not reset between runs.
  const run = Date.now();
  const recipeName = `Taco night ${run}`;
  const meetingTitle = `Taco Thursday ${run}`;

  const alice = await (await browser.newContext()).newPage();
  await signIn(alice, `meals-alice-${run}@example.com`, "Alice");

  await alice.getByRole("link", { name: "Create a group" }).click();
  await alice.getByLabel("Group name").fill(`Supper ${run}`);
  await alice.getByRole("button", { name: "Create group" }).click();
  await expectApp(alice.getByRole("heading", { name: `Supper ${run}` })).toBeVisible();

  // A recipe with two items — enough to tell "the one I claimed" from "the
  // rest" without making the assertions depend on ordering.
  await alice.getByRole("link", { name: "Recipes" }).click();
  await alice.getByRole("link", { name: "Add a recipe" }).click();
  await alice.getByPlaceholder("Recipe name").fill(recipeName);
  await alice.getByRole("button", { name: "Add item" }).click();
  const items = alice.getByPlaceholder("What someone brings");
  await items.nth(0).fill("ground beef");
  await items.nth(1).fill("tortilla chips");
  await alice.getByRole("button", { name: "Save recipe" }).click();
  await expectApp(alice.getByText(recipeName)).toBeVisible();

  await alice.getByRole("link", { name: "Meetings" }).click();
  await alice.getByRole("button", { name: "Plan a meeting" }).click();
  await alice.getByPlaceholder("Meeting title").fill(meetingTitle);
  await alice.locator('input[name="date"]').fill("2026-10-01");
  await alice.getByRole("button", { name: "Create meeting" }).click();
  await expectApp(alice.getByRole("link", { name: new RegExp(meetingTitle) })).toBeVisible();

  await alice.getByRole("link", { name: new RegExp(meetingTitle) }).click();
  await expectApp(alice.getByText("No meal planned yet")).toBeVisible();

  // Setting the meal copies the recipe's items in as claimable slots.
  await alice.getByRole("button", { name: "Pick a recipe" }).click();
  await alice.getByRole("button", { name: new RegExp(recipeName) }).click();
  await expectApp(alice.getByRole("button", { name: "Claim" })).toHaveCount(2);

  await alice.getByRole("button", { name: "Claim" }).first().click();
  await expectApp(alice.getByRole("button", { name: "Release" })).toBeVisible();
  await expectApp(alice.getByText("You")).toBeVisible();
  await expectApp(alice.getByRole("button", { name: "Claim" })).toHaveCount(1);

  await alice.getByRole("button", { name: "Release" }).click();
  await expectApp(alice.getByRole("button", { name: "Claim" })).toHaveCount(2);
  await expect(alice.getByRole("button", { name: "Release" })).toHaveCount(0);
});
