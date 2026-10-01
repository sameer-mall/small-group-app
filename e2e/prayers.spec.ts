import { expect, test } from "@playwright/test";
import { expectApp, memberContext, signIn } from "./helpers";

test("two members fill the bowl, draw it, and each gets the other's request", async ({ browser }) => {
  const run = Date.now();
  const aliceRequest = `For my dad's surgery ${run}`;
  const bobRequest = `For a new job ${run}`;
  // Today, in the browser's own timezone (the test process shares it): the
  // bowl only polls within a day of the meeting, which is when groups draw.
  const today = new Date().toLocaleDateString("en-CA");

  const alice = await (await memberContext(browser)).newPage();
  await signIn(alice, `prayer-alice-${run}@example.com`, "Alice");
  await alice.getByRole("link", { name: "Create a group" }).click();
  await alice.getByLabel("Group name").fill(`Bowl ${run}`);
  await alice.getByRole("button", { name: "Create group" }).click();
  await expectApp(alice.getByRole("heading", { name: `Bowl ${run}` })).toBeVisible();

  // Bob joins through the invite link; Alice approves.
  await alice.getByRole("link", { name: "Group" }).click();
  const inviteUrl = await alice.getByTestId("invite-url").innerText();
  const bob = await (await memberContext(browser)).newPage();
  await signIn(bob, `prayer-bob-${run}@example.com`, "Bob");
  await bob.goto(new URL(inviteUrl).pathname);
  await bob.getByRole("button", { name: "Ask to join" }).click();
  await expectApp(bob.getByText("Waiting for approval")).toBeVisible();
  await alice.reload();
  await alice.getByRole("button", { name: "Approve" }).click();
  await expectApp(alice.getByTestId("member-row").filter({ hasText: "Bob" })).toBeVisible();

  // Alice plans the meeting.
  await alice.getByRole("link", { name: "Meetings" }).click();
  await alice.getByRole("button", { name: "Plan a meeting" }).click();
  await alice.getByPlaceholder("Meeting title").fill(`Week ${run}`);
  await alice.locator('input[name="date"]').fill(today);
  await alice.getByRole("button", { name: "Create meeting" }).click();
  const meetingLink = alice.getByRole("link", { name: new RegExp(`Week ${run}`) });
  await expectApp(meetingLink).toBeVisible();
  await meetingLink.click();
  await expectApp(alice.getByRole("button", { name: "I'm in" })).toBeVisible();
  const meetingPath = new URL(alice.url()).pathname;

  // Alice signs hers; Bob doesn't.
  await alice.getByRole("button", { name: "I'm in" }).click();
  await alice.getByLabel("Your prayer request").fill(aliceRequest);
  await alice.getByRole("switch", { name: "Include my name" }).click();
  await alice.getByRole("button", { name: "Put it in the bowl" }).click();
  await expectApp(alice.getByText("Submitted")).toBeVisible();

  await bob.goto(meetingPath);
  await bob.getByRole("button", { name: "I'm in" }).click();
  await bob.getByLabel("Your prayer request").fill(bobRequest);
  await bob.getByRole("button", { name: "Put it in the bowl" }).click();
  await expectApp(bob.getByText("You, Alice")).toBeVisible();

  // Alice's page picks Bob up by polling — and never shows his words.
  await expectApp(alice.getByRole("button", { name: "Draw the bowl" })).toBeVisible();
  await expect(alice.getByText(bobRequest)).toHaveCount(0);
  // Not just the rendered DOM — the inline RSC payload embedded in the page's
  // HTML can carry a value the visible tree never shows.
  expect(await alice.content()).not.toContain(bobRequest);
  // Regression guard: the compiler once dropped the space after the number,
  // rendering "2people in" instead of "2 people in".
  await expect(alice.getByText("2 people in · you'll each draw one request")).toBeVisible();

  await alice.getByRole("button", { name: "Draw the bowl" }).click();
  await alice.getByRole("dialog").getByRole("button", { name: "Draw the bowl" }).click();

  // With two people the draw is a swap, so the outcome is certain.
  await expectApp(alice.getByText(bobRequest)).toBeVisible();
  await expectApp(alice.getByText("Name not shared")).toBeVisible();

  await bob.goto(meetingPath);
  await expectApp(bob.getByText(aliceRequest)).toBeVisible();
  await expectApp(bob.getByText("From Alice")).toBeVisible();

  // And it stays prayable from My prayers.
  await bob.getByRole("link", { name: "My prayers", exact: true }).click();
  await bob.waitForURL(/\/prayers$/);
  await expectApp(bob.getByRole("heading", { name: "My prayers", level: 1 })).toBeVisible();
  await expectApp(bob.locator("article").filter({ hasText: aliceRequest })).toBeVisible();
});

test("Edit my request stays disabled while the submit is in flight", async ({ browser }) => {
  const run = Date.now();
  const request = `For patience ${run}`;
  const today = new Date().toLocaleDateString("en-CA");

  const alice = await (await memberContext(browser)).newPage();
  await signIn(alice, `prayer-race-${run}@example.com`, "Alice");
  await alice.getByRole("link", { name: "Create a group" }).click();
  await alice.getByLabel("Group name").fill(`Race ${run}`);
  await alice.getByRole("button", { name: "Create group" }).click();
  await expectApp(alice.getByRole("heading", { name: `Race ${run}` })).toBeVisible();

  await alice.getByRole("link", { name: "Meetings" }).click();
  await alice.getByRole("button", { name: "Plan a meeting" }).click();
  await alice.getByPlaceholder("Meeting title").fill(`Week ${run}`);
  await alice.locator('input[name="date"]').fill(today);
  await alice.getByRole("button", { name: "Create meeting" }).click();
  const meetingLink = alice.getByRole("link", { name: new RegExp(`Week ${run}`) });
  await expectApp(meetingLink).toBeVisible();
  await meetingLink.click();
  await expectApp(alice.getByRole("button", { name: "I'm in" })).toBeVisible();

  await alice.getByRole("button", { name: "I'm in" }).click();
  await alice.getByLabel("Your prayer request").fill(request);

  // Hold every server-action POST for 2s, simulating a slow round trip, so
  // the viewer can tap "Edit my request" while the submit is still pending.
  await alice.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() === "POST" && req.headers()["next-action"]) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    await route.continue();
  });

  await alice.getByRole("button", { name: "Put it in the bowl" }).click();

  const editButton = alice.getByRole("button", { name: "Edit my request" });
  await expect(editButton).toBeVisible();
  await expect(editButton).toBeDisabled();

  // Once the held response lands, the button re-enables.
  await expectApp(editButton).toBeEnabled();

  await editButton.click();
  await expect(alice.getByLabel("Your prayer request")).toHaveValue(request);

  await alice.unrouteAll({ behavior: "wait" });
});
