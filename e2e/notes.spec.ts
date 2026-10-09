import { expect, test } from "@playwright/test";
import { expectApp, memberContext, signIn } from "./helpers";

test("a member's note autosaves, stays private, lands in My notes, and outlives its meeting", async ({
  browser,
}) => {
  const run = Date.now();
  const firstLine = `Ask about Sarah's job interview ${run}`;
  const note = `${firstLine}\nv. 28 — all things work together`;
  const today = new Date().toLocaleDateString("en-CA");

  const alice = await (await memberContext(browser)).newPage();
  await signIn(alice, `notes-alice-${run}@example.com`, "Alice");
  await alice.getByRole("link", { name: "Create a group" }).click();
  await alice.getByLabel("Group name").fill(`Notes ${run}`);
  await alice.getByRole("button", { name: "Create group" }).click();
  await expectApp(alice.getByRole("heading", { name: `Notes ${run}` })).toBeVisible();

  // Bob joins through the invite link; Alice approves.
  await alice.getByRole("link", { name: "Group" }).click();
  const inviteUrl = await alice.getByTestId("invite-url").innerText();
  const bob = await (await memberContext(browser)).newPage();
  await signIn(bob, `notes-bob-${run}@example.com`, "Bob");
  await bob.goto(new URL(inviteUrl).pathname);
  await bob.getByRole("button", { name: "Ask to join" }).click();
  await expectApp(bob.getByText("Waiting for approval")).toBeVisible();
  await alice.reload();
  await alice.getByRole("button", { name: "Approve" }).click();
  await expectApp(alice.getByTestId("member-row").filter({ hasText: "Bob" })).toBeVisible();

  // Alice plans the meeting and opens it.
  await alice.getByRole("link", { name: "Meetings" }).click();
  await alice.getByRole("button", { name: "Plan a meeting" }).click();
  await alice.getByPlaceholder("Meeting title").fill(`Week ${run}`);
  await alice.locator('input[name="date"]').fill(today);
  await alice.getByRole("button", { name: "Create meeting" }).click();
  const meetingLink = alice.getByRole("link", { name: new RegExp(`Week ${run}`) });
  await expectApp(meetingLink).toBeVisible();
  await meetingLink.click();
  await expectApp(alice.getByRole("heading", { name: "My note" })).toBeVisible();
  const meetingPath = new URL(alice.url()).pathname;

  // She writes; it saves itself.
  const field = alice.getByLabel("My note", { exact: true });
  await expect(field).toHaveAttribute("placeholder", "Tap to start a private note…");
  await field.fill(note);
  await expectApp(alice.getByText("Saved just now")).toBeVisible();
  await expect(alice.getByText("Only you can see this")).toBeVisible();

  // It's on the server, not just in the field.
  await alice.reload();
  await expectApp(alice.getByLabel("My note", { exact: true })).toHaveValue(note);

  // Private: Bob, on the same meeting, sees an empty note — and Alice's words
  // are nowhere in his page, not even in the inline RSC payload.
  await bob.goto(meetingPath);
  await expectApp(bob.getByLabel("My note", { exact: true })).toHaveValue("");
  expect(await bob.content()).not.toContain(firstLine);

  // My notes lists it under its meeting, and opening it goes back there.
  await alice.getByRole("link", { name: "See all my notes ›" }).click();
  await alice.waitForURL(/\/notes$/);
  await expectApp(alice.getByRole("heading", { name: "My notes", level: 1 })).toBeVisible();
  // Back returns to the meeting My notes was opened from.
  await alice.getByRole("link", { name: "Back to Meeting", exact: true }).click();
  await alice.waitForURL((url) => url.pathname === meetingPath);
  await alice.getByRole("link", { name: "See all my notes ›" }).click();
  await alice.waitForURL(/\/notes$/);
  const card = alice.getByRole("link").filter({ hasText: firstLine });
  await expect(card).toContainText(`Week ${run}`);
  await card.click();
  await alice.waitForURL((url) => url.pathname === meetingPath);
  await expectApp(alice.getByLabel("My note", { exact: true })).toHaveValue(note);

  // Deleting the meeting keeps the note: My notes still has it, marked.
  await alice.getByRole("button", { name: "Meeting actions" }).click();
  await alice.getByRole("menuitem", { name: "Delete meeting" }).click();
  await expect(alice.getByText("Everyone's notes are kept in My notes.")).toBeVisible();
  await alice.getByRole("dialog").getByRole("button", { name: "Delete meeting" }).click();
  await alice.waitForURL((url) => url.pathname !== meetingPath);
  await alice.goto("/notes");
  const kept = alice.getByRole("link").filter({ hasText: firstLine });
  await expectApp(kept).toBeVisible();
  await expect(kept).toContainText(`Week ${run}`);
  await expect(kept).toContainText("Meeting deleted");

  // It opens on its own page, where it can still be edited…
  await kept.click();
  await alice.waitForURL(/\/notes\/[^/]+$/);
  await expectApp(alice.getByLabel("My note", { exact: true })).toHaveValue(note);
  await alice.getByLabel("My note", { exact: true }).fill(`${note}\nfollow up next week`);
  await expectApp(alice.getByText("Saved just now")).toBeVisible();
  await alice.reload();
  await expectApp(alice.getByLabel("My note", { exact: true })).toHaveValue(`${note}\nfollow up next week`);

  // …and deleted, behind a confirm.
  await alice.getByRole("button", { name: "Delete note" }).click();
  await alice.getByRole("dialog").getByRole("button", { name: "Delete note" }).click();
  await alice.waitForURL(/\/notes$/);
  await expectApp(alice.getByText("No notes yet")).toBeVisible();
});
