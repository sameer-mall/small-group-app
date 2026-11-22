import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { config } from "dotenv";
import { Pool } from "pg";
import { expectApp, memberContext, signIn } from "./helpers";

// Chromium's user agent follows the host OS, so the device is "This computer"
// on Linux CI and "This Mac" on a Mac.
const THIS_DEVICE = /^This (computer|Mac)$/;
const REMOVE_THIS_DEVICE = /^Remove This (computer|Mac)$/;

// A platform authenticator that always verifies the user, like Face ID that
// recognizes you. Chromium only.
async function addVirtualAuthenticator(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

// Removing the passkey from another device: the server forgets it while this
// device still holds the credential and the cookie.
async function deletePasskeysFor(email: string) {
  config({ quiet: true });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`delete from passkey where user_id = (select id from "user" where email = $1)`, [email]);
  } finally {
    await pool.end();
  }
}

async function signOut(page: Page) {
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/sign-in/);
}

test("turn on passkey sign-in after a code sign-in, use it, and hear when it was removed", async ({ browser }) => {
  const email = `passkey-${Date.now()}@example.com`;
  const context = await memberContext(browser);
  const page = await context.newPage();
  await addVirtualAuthenticator(context, page);

  // A device without a passkey sees today's screen: no passkey button.
  await page.goto("/sign-in");
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByRole("button", { name: /passkey/i })).toHaveCount(0);

  await signIn(page, email, "Pat");
  const offer = page.getByRole("dialog", { name: "Sign in with a passkey next time?" });
  await expectApp(offer).toBeVisible();
  await offer.getByRole("button", { name: "Turn on passkey sign-in" }).click();
  await expectApp(offer).toBeHidden();

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expectApp(page.getByText(THIS_DEVICE)).toBeVisible();
  await expect(page.getByText("On", { exact: true })).toBeVisible();

  // Signed out, this device opens to Welcome back, and the button signs in.
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/sign-in/);
  await expectApp(page.getByText("Welcome back.")).toBeVisible();
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await page.waitForURL((url) => url.pathname !== "/sign-in");

  // Removed elsewhere: the server refuses it, and the form comes back with a notice.
  await deletePasskeysFor(email);
  await signOut(page);
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expectApp(page.getByText("Passkey sign-in was turned off for this device.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Welcome back.")).toHaveCount(0);
});

test("dismiss the offer, turn it on from Settings, then remove it there", async ({ browser }) => {
  const email = `passkey-settings-${Date.now()}@example.com`;
  const context = await memberContext(browser);
  const page = await context.newPage();
  await addVirtualAuthenticator(context, page);

  await signIn(page, email, "Lee");
  const offer = page.getByRole("dialog", { name: "Sign in with a passkey next time?" });
  await expectApp(offer).toBeVisible();
  await offer.getByRole("button", { name: "Not now" }).click();

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(offer).toHaveCount(0); // once per device
  await page.getByRole("button", { name: "Turn on passkey sign-in" }).click();
  await expectApp(page.getByText(THIS_DEVICE)).toBeVisible();

  await page.getByRole("button", { name: REMOVE_THIS_DEVICE }).click();
  await expectApp(page.getByRole("button", { name: "Turn on passkey sign-in" })).toBeVisible();

  // Removing this device's passkey also forgets it here: the plain form.
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/sign-in/);
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByText("Welcome back.")).toHaveCount(0);
});
