import { readFileSync } from "node:fs";
import { expect, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";

const MAIL = ".e2e-mail.jsonl";

// Most assertions follow a server action + revalidatePath (or a navigation to
// a page whose data a prior action just mutated). Under CI/worker load that
// round trip has been observed to take ~1-4s+, well past Playwright's 5s
// default expect timeout, so those assertions use this longer-timeout expect
// instead. Plain fast-path checks (e.g. URL checks) can stay on `expect`.
export const expectApp = expect.configure({ timeout: 10_000 });

// Each simulated member signs in from their own client IP, as real members
// on their own devices do. Better Auth limits sign-in code requests per IP
// (10 per 60s), and without this every member in the suite shares localhost's one bucket.
export function memberContext(browser: Browser, options: BrowserContextOptions = {}) {
  const octet = () => Math.floor(Math.random() * 250) + 2;
  return browser.newContext({
    ...options,
    extraHTTPHeaders: { "x-forwarded-for": `10.${octet()}.${octet()}.${octet()}` },
  });
}

export async function signIn(page: Page, email: string, name: string) {
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
