import { test } from "@playwright/test";
import { expectApp, memberContext, signIn } from "./helpers";

test("two users: create group, invite, approve, member arrives", async ({ browser }) => {
  const run = Date.now();

  const alice = await (await memberContext(browser)).newPage();
  await signIn(alice, `alice-${run}@example.com`, "Alice");
  await alice.getByRole("link", { name: "Create a group" }).click();
  await alice.getByLabel("Group name").fill(`Tuesday ${run}`);
  await alice.getByRole("button", { name: "Create group" }).click();
  await expectApp(alice.getByText(`Tuesday ${run}`)).toBeVisible();

  await alice.getByRole("link", { name: "Group" }).click();
  await expectApp(alice.getByText(`Signed in as alice-${run}@example.com`)).toBeVisible();
  const inviteUrl = await alice.getByTestId("invite-url").innerText();

  const bob = await (await memberContext(browser)).newPage();
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

  const carol = await (await memberContext(browser)).newPage();
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
