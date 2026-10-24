import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/db/client";
import { session as sessionTable } from "@/db/auth-schema";
import { auth } from "@/lib/auth";
import { createGroup } from "@/lib/groups";
import { GET } from "@/app/open/route";

// A notification for one group, tapped while the app had another group open,
// must land in the notification's group: /open switches, then redirects.

async function mkUser(id: string) {
  await db.execute(sql`insert into "user" (id, name, email, email_verified, created_at, updated_at)
    values (${id}, ${id}, ${id + "@example.com"}, true, now(), now()) on conflict do nothing`);
  return id;
}

// The emailed code can't be replayed (it's stored hashed), so mint the session
// row directly and sign its cookie the way Better Auth does.
async function signIn(userId: string, activeOrganizationId: string) {
  const ctx = await auth.$context;
  const s = await ctx.internalAdapter.createSession(userId, false, { activeOrganizationId });
  const signature = createHmac("sha256", ctx.secret).update(s.token).digest("base64");
  return {
    sessionId: s.id,
    cookie: `${ctx.authCookies.sessionToken.name}=${encodeURIComponent(`${s.token}.${signature}`)}`,
  };
}

function open(query: string, cookie?: string) {
  return GET(
    new NextRequest(`http://localhost:3000/open?${query}`, { headers: cookie ? { cookie } : {} }),
  );
}

function landing(res: Response): string {
  const location = new URL(res.headers.get("location")!);
  return location.pathname + location.search;
}

async function activeGroupOf(sessionId: string) {
  const [row] = await db
    .select({ active: sessionTable.activeOrganizationId })
    .from(sessionTable)
    .where(eq(sessionTable.id, sessionId));
  return row.active;
}

describe("/open: notification taps land in their own group", () => {
  let alice: string, groupA: string, groupB: string, strangersGroup: string;

  beforeAll(async () => {
    alice = await mkUser(`u_open_alice_${crypto.randomUUID()}`);
    const stranger = await mkUser(`u_open_stranger_${crypto.randomUUID()}`);
    ({ groupId: groupA } = await createGroup(alice, "Group A"));
    ({ groupId: groupB } = await createGroup(alice, "Group B"));
    ({ groupId: strangersGroup } = await createGroup(stranger, "Not Alice's"));
  });

  it("switches to the notification's group, then opens the screen", async () => {
    const { sessionId, cookie } = await signIn(alice, groupB);
    const res = await open(`group=${groupA}&next=%2Fmeetings%2Fm1`, cookie);
    expect(res.status).toBe(307);
    expect(landing(res)).toBe("/meetings/m1");
    expect(await activeGroupOf(sessionId)).toBe(groupA);
  });

  it("leaves the group alone for a group the member isn't in", async () => {
    const { sessionId, cookie } = await signIn(alice, groupB);
    const res = await open(`group=${strangersGroup}&next=%2Fgroup`, cookie);
    expect(landing(res)).toBe("/group");
    expect(await activeGroupOf(sessionId)).toBe(groupB);
  });

  it("never redirects off the site", async () => {
    const { cookie } = await signIn(alice, groupB);
    const res = await open(`group=${groupA}&next=%2F%2Fevil.example`, cookie);
    expect(landing(res)).toBe("/");
  });

  it("signed out: signs in, then comes back through /open", async () => {
    const query = `group=${groupA}&next=%2Fmeetings%2Fm1`;
    const res = await open(query);
    expect(landing(res)).toBe(`/sign-in?next=${encodeURIComponent(`/open?${query}`)}`);
  });
});
