import { readFileSync, rmSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const MAIL = ".e2e-mail.jsonl";

// Every assertion below follows a server action + revalidatePath (or a
// navigation to a page whose data a prior action just mutated). Under CI/
// worker load that round trip has been observed to take ~1-4s+, well past
// Playwright's 5s default expect timeout, so those assertions all use this
// longer-timeout expect instead. Plain fast-path checks (e.g. URL checks)
// can stay on the default `expect`.
const expectApp = expect.configure({ timeout: 10_000 });

async function signIn(page: Page, email: string, name: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send magic link" }).click();
  await expectApp(page.getByText("Check your email")).toBeVisible();
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
  await expectApp(alice.getByText(`Tuesday ${run}`)).toBeVisible();

  await alice.getByRole("link", { name: "Group" }).click();
  const inviteUrl = await alice.getByTestId("invite-url").innerText();

  const bob = await (await browser.newContext()).newPage();
  await signIn(bob, `bob-${run}@example.com`, "Bob");
  await bob.goto(new URL(inviteUrl).pathname);
  await bob.getByRole("button", { name: "Ask to join" }).click();
  await expectApp(bob.getByText("Waiting for approval")).toBeVisible();

  await alice.reload();
  await alice.getByRole("button", { name: "Approve" }).click();
  // Scoped to a member row (not a bare getByText("Bob")): while the approve
  // action's revalidation is in flight, the still-mounted pending-request row
  // ("Bob wants to join" + "bob-...@example.com") also substring-matches
  // "Bob" case-insensitively, which is a Playwright strict-mode violation,
  // not just "not visible yet" — so an unscoped locator flakes under worker
  // contention even with a longer timeout.
  await expectApp(
    alice.getByTestId("member-row").filter({ hasText: "Bob" }),
  ).toBeVisible();

  await bob.goto("/");
  await expectApp(bob.getByText(`Tuesday ${run}`)).toBeVisible();
});

test("switcher menu creates a second group and switches back", async ({ browser }) => {
  const run = Date.now();

  const carol = await (await browser.newContext()).newPage();
  await signIn(carol, `carol-${run}@example.com`, "Carol");

  await carol.getByRole("link", { name: "Create a group" }).click();
  await carol.getByLabel("Group name").fill(`Tuesday ${run}`);
  await carol.getByRole("button", { name: "Create group" }).click();
  await expectApp(carol.getByRole("heading", { name: `Tuesday ${run}` })).toBeVisible();

  // <NoGroupHome /> is gone now that Carol has a group, so the switcher menu is
  // the only remaining route to a second one.
  await carol.getByRole("button", { name: `Tuesday ${run}` }).click();
  await carol.getByRole("menuitem", { name: "Create a group" }).click();
  await carol.getByLabel("Group name").fill(`Thursday ${run}`);
  await carol.getByRole("button", { name: "Create group" }).click();
  await expectApp(carol.getByRole("heading", { name: `Thursday ${run}` })).toBeVisible();

  // Both groups must be listed without a reload: the menu is fed by the server
  // render, not by a client-side org list that createGroup never invalidates.
  await carol.getByRole("button", { name: `Thursday ${run}` }).click();
  await expectApp(
    carol.getByRole("menuitemradio", { name: `Thursday ${run}` }),
  ).toBeVisible();
  await carol.getByRole("menuitemradio", { name: `Tuesday ${run}` }).click();
  await expectApp(carol.getByRole("heading", { name: `Tuesday ${run}` })).toBeVisible();
});
