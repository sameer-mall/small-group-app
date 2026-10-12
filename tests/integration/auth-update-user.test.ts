import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auth } from "@/lib/auth";

// A fresh account with a live session, and the Cookie header a browser would
// send for it. The sign-in code is stored hashed, so the test cannot replay
// the emailed-code flow; instead it creates the session row directly and
// signs the cookie the way Better Auth does (better-call's signCookieValue:
// `${token}.${base64 HMAC-SHA256}`, URI-encoded).
async function signedInHeaders(email: string): Promise<Headers> {
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser({ email, name: "", emailVerified: true });
  const session = await ctx.internalAdapter.createSession(user.id);
  const signature = createHmac("sha256", ctx.secret).update(session.token).digest("base64");
  const value = encodeURIComponent(`${session.token}.${signature}`);
  return new Headers({ cookie: `${ctx.authCookies.sessionToken.name}=${value}` });
}

async function userByEmail(email: string) {
  const { rows } = await db.execute(sql`select name, image from "user" where email = ${email}`);
  return rows[0] as { name: string; image: string | null };
}

describe("the update-user endpoint", () => {
  it("still lets the Welcome screen set a name", async () => {
    const email = `upd-name-${crypto.randomUUID()}@example.com`;
    const headers = await signedInHeaders(email);
    await auth.api.updateUser({ body: { name: "Quinn" }, headers });
    expect((await userByEmail(email)).name).toBe("Quinn");
  });

  it("refuses an image from the browser: photos only come through saveAvatar", async () => {
    const email = `upd-image-${crypto.randomUUID()}@example.com`;
    const headers = await signedInHeaders(email);
    await expect(
      auth.api.updateUser({ body: { image: "https://evil.example/pixel.gif" }, headers }),
    ).rejects.toMatchObject({ status: "BAD_REQUEST" });
    expect((await userByEmail(email)).image).toBeNull();
  });
});
