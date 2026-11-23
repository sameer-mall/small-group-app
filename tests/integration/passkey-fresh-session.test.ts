import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auth, passkeyChecks } from "@/lib/auth";

// A fresh account with a live session, and the Cookie header a browser would
// send for it (copied from auth-update-user.test.ts). Returns the session id
// too, so the test can age the session row.
async function signedInHeaders(email: string): Promise<{ headers: Headers; sessionId: string }> {
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser({ email, name: "", emailVerified: true });
  const session = await ctx.internalAdapter.createSession(user.id);
  const signature = createHmac("sha256", ctx.secret).update(session.token).digest("base64");
  const value = encodeURIComponent(`${session.token}.${signature}`);
  return {
    headers: new Headers({ cookie: `${ctx.authCookies.sessionToken.name}=${value}` }),
    sessionId: session.id,
  };
}

// The plugin guards registration with Better Auth's fresh-session check, which
// by default refuses a session created more than 24 hours ago. Members turn on
// Face ID from Settings on sessions that are days or weeks old.
describe("turning on a passkey from an old session", () => {
  it("still gets registration options two days after signing in", async () => {
    const { headers, sessionId } = await signedInHeaders(`fresh-${crypto.randomUUID()}@example.com`);
    await db.execute(
      sql`update "session" set created_at = now() - interval '2 days' where id = ${sessionId}`,
    );
    const options = await auth.api.generatePasskeyRegistrationOptions({ headers });
    expect(options.challenge).toEqual(expect.any(String));
  });
});

// The app lists and removes passkeys through src/lib/passkeys.ts. The plugin's
// own list (which returns the public key), rename, and delete stay switched off.
describe("the plugin's list, rename, and delete endpoints", () => {
  it.each([
    ["GET", "/passkey/list-user-passkeys"],
    ["POST", "/passkey/update-passkey"],
    ["POST", "/passkey/delete-passkey"],
  ])("%s %s is not found", async (method, path) => {
    const { headers } = await signedInHeaders(`paths-${crypto.randomUUID()}@example.com`);
    headers.set("content-type", "application/json");
    // An absolute URL of our own: ctx.baseURL is empty where BETTER_AUTH_URL
    // isn't set (CI's checks job), and the handler routes on the path anyway.
    // An empty body: with the endpoint on, it answers 400, not a "no such
    // passkey" 404 that would look the same as switched off.
    const body = method === "POST" ? "{}" : undefined;
    const res = await auth.handler(new Request(`http://localhost:3000/api/auth${path}`, { method, headers, body }));
    expect(res.status).toBe(404);
  });
});

// The plugin itself verifies with requireUserVerification: false. These checks
// run inside its verify endpoints, before a passkey is saved or a session made.
describe("passkey user verification", () => {
  it("refuses a registration made without Face ID, a fingerprint, or the PIN", async () => {
    await expect(
      passkeyChecks.registration({
        ctx: {} as never,
        verification: { registrationInfo: { userVerified: false } },
      }),
    ).rejects.toThrow("User verification is required.");
  });

  it("refuses a sign-in made without it", async () => {
    await expect(
      passkeyChecks.authentication({ verification: { authenticationInfo: { userVerified: false } } }),
    ).rejects.toThrow("User verification is required.");
  });

  it("lets a verified sign-in through", async () => {
    await expect(
      passkeyChecks.authentication({ verification: { authenticationInfo: { userVerified: true } } }),
    ).resolves.toBeUndefined();
  });
});
