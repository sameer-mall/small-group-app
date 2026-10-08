import { expect, test, type Page } from "@playwright/test";
import { expectApp, latestCode, memberContext, requestCode, signIn } from "./helpers";

// Better Auth's client resolves `{ error }` for an HTTP error but lets a failed
// fetch() reject (Safari's "TypeError: Load failed"). Each test here fails one
// auth request at the network and checks the screen says so and can be retried,
// instead of locking up with its buttons disabled (Sentry SMALL-GROUP-8).

const UNREACHABLE = "Couldn't reach the server. Check your connection and try again.";

// The unhandled rejection is how SMALL-GROUP-8 reached Sentry.
function pageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("sign-in recovers when the code check can't reach the server", async ({ browser }) => {
  const email = `offline-code-${Date.now()}@example.com`;
  const page = await (await memberContext(browser)).newPage();
  const errors = pageErrors(page);

  await requestCode(page, email);
  await page.route("**/api/auth/sign-in/email-otp", (route) => route.abort("failed"));
  await page.getByLabel("Sign-in code").fill(latestCode(email));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page.getByText(UNREACHABLE)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Send a new code" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Use a different email" })).toBeEnabled();

  await page.unroute("**/api/auth/sign-in/email-otp");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => url.pathname !== "/sign-in");
  expect(errors).toEqual([]);
});

test("sending a code says when it can't reach the server", async ({ browser }) => {
  const page = await (await memberContext(browser)).newPage();
  const errors = pageErrors(page);

  await page.route("**/api/auth/email-otp/send-verification-otp", (route) =>
    route.abort("failed"),
  );
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(`offline-send-${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Email me a code" }).click();

  await expect(page.getByText(UNREACHABLE)).toBeVisible();
  await expect(page.getByRole("button", { name: "Email me a code" })).toBeEnabled();
  await expect(page.getByLabel("Sign-in code")).toBeHidden();
  expect(errors).toEqual([]);
});

test("Google sign-in says when it can't reach the server", async ({ browser }) => {
  const page = await (await memberContext(browser)).newPage();
  const errors = pageErrors(page);

  await page.route("**/api/auth/sign-in/social", (route) => route.abort("failed"));
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Continue with Google" }).click();

  await expect(page.getByText(UNREACHABLE)).toBeVisible();
  expect(errors).toEqual([]);
});

test("welcome stays put until the name is saved", async ({ browser }) => {
  const email = `offline-welcome-${Date.now()}@example.com`;
  const page = await (await memberContext(browser)).newPage();
  const errors = pageErrors(page);

  await requestCode(page, email);
  await page.getByLabel("Sign-in code").fill(latestCode(email));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/welcome");
  await page.getByLabel("Display name").fill("Wren");

  await page.route("**/api/auth/update-user", (route) => route.abort("failed"));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(UNREACHABLE)).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
  expect(new URL(page.url()).pathname).toBe("/welcome");

  // A server error comes back as `{ error }` rather than a throw.
  await page.unroute("**/api/auth/update-user");
  await page.route("**/api/auth/update-user", (route) =>
    route.fulfill({ status: 500, json: { message: "Internal Server Error" } }),
  );
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Couldn't save your name. Try again.")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/welcome");

  await page.unroute("**/api/auth/update-user");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => url.pathname !== "/welcome");
  expect(errors).toEqual([]);
});

test("sign out says when it can't reach the server", async ({ browser }) => {
  const page = await (await memberContext(browser)).newPage();
  const errors = pageErrors(page);
  await signIn(page, `offline-signout-${Date.now()}@example.com`, "Ash");

  // No group yet, so this is <NoGroupHome />, which has its own Sign out.
  await page.route("**/api/auth/sign-out", (route) => route.abort("failed"));
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText(UNREACHABLE)).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");

  // Sign-out answers success even with no session, so an error means this
  // one is still live: stay put rather than pretend.
  await page.unroute("**/api/auth/sign-out");
  await page.route("**/api/auth/sign-out", (route) =>
    route.fulfill({ status: 500, json: { message: "Internal Server Error" } }),
  );
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("Couldn't sign you out. Try again.")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");

  await page.unroute("**/api/auth/sign-out");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/sign-in");
  expect(errors).toEqual([]);
});

test("switching groups says when it can't reach the server", async ({ browser }) => {
  const run = Date.now();
  const page = await (await memberContext(browser)).newPage();
  const errors = pageErrors(page);
  await signIn(page, `offline-switch-${run}@example.com`, "Rue");

  await page.getByRole("link", { name: "Create a group" }).click();
  await page.getByLabel("Group name").fill(`Tuesday ${run}`);
  await page.getByRole("button", { name: "Create group" }).click();
  await expectApp(page.getByRole("heading", { name: `Tuesday ${run}` })).toBeVisible();
  await page.getByRole("button", { name: `Tuesday ${run}` }).click();
  await page.getByRole("menuitem", { name: "Create a group" }).click();
  await page.getByLabel("Group name").fill(`Thursday ${run}`);
  await page.getByRole("button", { name: "Create group" }).click();
  await expectApp(page.getByRole("heading", { name: `Thursday ${run}` })).toBeVisible();

  await page.route("**/api/auth/organization/set-active", (route) => route.abort("failed"));
  await page.getByRole("button", { name: `Thursday ${run}` }).click();
  await page.getByRole("menuitemradio", { name: `Tuesday ${run}` }).click();
  // The open menu would sit on top of the message, which renders just below
  // the heading.
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(page.getByText(UNREACHABLE)).toBeVisible();
  await expect(page.getByRole("heading", { name: `Thursday ${run}` })).toBeVisible();

  await page.unroute("**/api/auth/organization/set-active");
  await page.getByRole("button", { name: `Thursday ${run}` }).click();
  await page.getByRole("menuitemradio", { name: `Tuesday ${run}` }).click();
  await expectApp(page.getByRole("heading", { name: `Tuesday ${run}` })).toBeVisible();
  await expect(page.getByText(UNREACHABLE)).toBeHidden();
  expect(errors).toEqual([]);
});
