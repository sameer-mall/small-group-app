import { readFileSync, rmSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const MAIL = ".e2e-mail.jsonl";

async function signIn(page: Page, email: string, name: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send magic link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  const lines = readFileSync(MAIL, "utf8").trim().split("\n");
  const { url } = JSON.parse(lines[lines.length - 1]);
  await page.goto(url);
  if (page.url().includes("/welcome")) {
    await page.getByLabel("Display name").fill(name);
    await page.getByRole("button", { name: "Continue" }).click();
  }
}

test("two users: create group, invite, approve, member arrives", async ({ browser }) => {
  rmSync(MAIL, { force: true });
  const run = Date.now();

  const alice = await (await browser.newContext()).newPage();
  await signIn(alice, `alice-${run}@example.com`, "Alice");
  await alice.getByRole("link", { name: "Create a group" }).click();
  await alice.getByLabel("Group name").fill(`Tuesday ${run}`);
  await alice.getByRole("button", { name: "Create group" }).click();
  await expect(alice.getByText(`Tuesday ${run}`)).toBeVisible();

  await alice.getByRole("link", { name: "Group" }).click();
  const inviteUrl = await alice.getByTestId("invite-url").innerText();

  const bob = await (await browser.newContext()).newPage();
  await signIn(bob, `bob-${run}@example.com`, "Bob");
  await bob.goto(new URL(inviteUrl).pathname);
  await bob.getByRole("button", { name: "Ask to join" }).click();
  await expect(bob.getByText("Waiting for approval")).toBeVisible();

  await alice.reload();
  await alice.getByRole("button", { name: "Approve" }).click();
  // Scoped to a member row (not a bare getByText("Bob")): while the approve
  // action's revalidation is in flight, the still-mounted pending-request row
  // ("Bob wants to join" + "bob-...@example.com") also substring-matches
  // "Bob" case-insensitively, which is a Playwright strict-mode violation,
  // not just "not visible yet" — so an unscoped locator flakes under worker
  // contention even with a longer timeout. A generous timeout covers the
  // server action + revalidatePath round trip (observed ~4s locally).
  await expect(
    alice.getByTestId("member-row").filter({ hasText: "Bob" }),
  ).toBeVisible({ timeout: 10_000 });

  await bob.goto("/");
  await expect(bob.getByText(`Tuesday ${run}`)).toBeVisible();
});
