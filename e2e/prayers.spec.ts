import { expect, test } from "@playwright/test";
import { expectApp, memberContext, signIn } from "./helpers";

test("members post to the wall, I'm in holds assigning, and each poster gets the other's request", async ({ browser }) => {
  const run = Date.now();
  const aliceRequest = `For my dad's surgery ${run}`;
  const bobRequest = `For a new job ${run}`;
  // Today, in the browser's own timezone (the test process shares it): the
  // wall only polls within a day of the meeting, which is when groups assign.
  const today = new Date().toLocaleDateString("en-CA");

  const alice = await (await memberContext(browser)).newPage();
  await signIn(alice, `prayer-alice-${run}@example.com`, "Alice");
  await alice.getByRole("link", { name: "Create a group" }).click();
  await alice.getByLabel("Group name").fill(`Wall ${run}`);
  await alice.getByRole("button", { name: "Create group" }).click();
  await expectApp(alice.getByRole("heading", { name: `Wall ${run}` })).toBeVisible();

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

  // Carol joins the group too. She'll tap I'm in without posting.
  const carol = await (await memberContext(browser)).newPage();
  await signIn(carol, `prayer-carol-${run}@example.com`, "Carol");
  await carol.goto(new URL(inviteUrl).pathname);
  await carol.getByRole("button", { name: "Ask to join" }).click();
  await expectApp(carol.getByText("Waiting for approval")).toBeVisible();
  await alice.reload();
  await alice.getByRole("button", { name: "Approve" }).click();
  await expectApp(alice.getByTestId("member-row").filter({ hasText: "Carol" })).toBeVisible();

  // Alice plans the meeting.
  await alice.getByRole("link", { name: "Meetings" }).click();
  await alice.getByRole("button", { name: "Plan a meeting" }).click();
  await alice.getByPlaceholder("Meeting title").fill(`Week ${run}`);
  await alice.locator('input[name="date"]').fill(today);
  await alice.getByRole("button", { name: "Create meeting" }).click();
  const meetingLink = alice.getByRole("link", { name: new RegExp(`Week ${run}`) });
  await expectApp(meetingLink).toBeVisible();
  await meetingLink.click();
  await expectApp(alice.getByRole("link", { name: "Open the prayer wall" })).toBeVisible();

  // Home shows nothing yet; the meeting card links to the wall.
  await alice.getByRole("link", { name: "Open the prayer wall" }).click();
  // The meeting card has a "Prayer wall" heading too, so wait for the URL.
  await alice.waitForURL(/\/prayers$/);
  await expectApp(alice.getByRole("heading", { name: "Prayer wall" })).toBeVisible();
  const wallPath = new URL(alice.url()).pathname;

  await alice.getByRole("button", { name: "I'm in" }).click();
  await alice.getByLabel("Share a request").fill(aliceRequest);
  await alice.getByRole("button", { name: "Post to the wall" }).click();
  await expectApp(alice.getByTestId("wall-request").filter({ hasText: aliceRequest })).toBeVisible();

  // Bob posts directly; both requests show for both.
  await bob.goto(wallPath);
  await bob.getByRole("button", { name: "I'm in" }).click();
  await bob.getByLabel("Share a request").fill(bobRequest);
  await bob.getByRole("button", { name: "Post to the wall" }).click();
  await expectApp(bob.getByTestId("wall-request").filter({ hasText: aliceRequest })).toBeVisible();
  await expectApp(alice.getByTestId("wall-request").filter({ hasText: bobRequest })).toBeVisible();

  // Carol taps I'm in and holds assigning up until she leaves.
  await carol.goto(wallPath);
  await carol.getByRole("button", { name: "I'm in" }).click();
  await expectApp(alice.getByText(/Waiting on Carol to post/)).toBeVisible();
  await carol.getByRole("button", { name: "I'm out" }).click();

  await alice.getByRole("button", { name: "Assign prayers" }).click();
  await alice.getByRole("dialog").getByRole("button", { name: "Assign prayers" }).click();
  await expectApp(alice.getByText("You're praying for")).toBeVisible();
  await expectApp(alice.getByText(`"${bobRequest}"`)).toBeVisible();
  await bob.reload();
  await expectApp(bob.getByText(`"${aliceRequest}"`)).toBeVisible();
  await expectApp(bob.getByText("Someone in the group is praying for this")).toBeVisible();

  // Home chip and My prayers.
  await alice.getByRole("link", { name: "Meetings", exact: true }).click();
  await expectApp(alice.getByText("Prayer wall · 2 requests")).toBeVisible();
  await alice.getByRole("link", { name: "My prayers" }).click();
  await expectApp(alice.getByText(`From Bob`)).toBeVisible();
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
  await alice.getByRole("link", { name: "Open the prayer wall" }).click();
  await expectApp(alice.getByRole("button", { name: "I'm in" })).toBeVisible();

  await alice.getByRole("button", { name: "I'm in" }).click();
  await alice.getByLabel("Share a request").fill(request);

  // Hold every server-action POST for 2s, simulating a slow round trip, so
  // the viewer can tap "Edit my request" while the submit is still pending.
  await alice.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() === "POST" && req.headers()["next-action"]) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    await route.continue();
  });

  await alice.getByRole("button", { name: "Post to the wall" }).click();

  const editButton = alice.getByRole("button", { name: "Edit my request" });
  await expect(editButton).toBeVisible();
  await expect(editButton).toBeDisabled();

  // Once the held response lands, the button re-enables.
  await expectApp(editButton).toBeEnabled();

  await editButton.click();
  await expect(alice.getByLabel("Share a request")).toHaveValue(request);

  await alice.unrouteAll({ behavior: "wait" });
});
