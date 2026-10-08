import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { markWhatsNewSeen, updateDisplayName } from "@/lib/profile";
import { LATEST_RELEASE_ID } from "@/lib/whats-new";

async function mkUser(id: string, name = id) {
  await db.execute(sql`insert into "user" (id, name, email, email_verified, created_at, updated_at)
    values (${id}, ${name}, ${id + "@example.com"}, true, now(), now()) on conflict do nothing`);
  return id;
}

async function nameOf(id: string) {
  const { rows } = await db.execute(sql`select name from "user" where id = ${id}`);
  return (rows[0] as { name: string }).name;
}

describe("profile domain", () => {
  let dana: string, eli: string;
  beforeAll(async () => {
    [dana, eli] = await Promise.all([mkUser("u_dana", "Dana"), mkUser("u_eli", "Eli")]);
  });

  it("updates only the given user's display name", async () => {
    await updateDisplayName(dana, "Dana Whitfield");
    expect(await nameOf(dana)).toBe("Dana Whitfield");
    expect(await nameOf(eli)).toBe("Eli");
  });

  it("refuses to update a user that doesn't exist", async () => {
    await expect(updateDisplayName("u_nobody", "Ghost")).rejects.toThrow("not-found");
  });
});

async function seenOf(id: string) {
  const { rows } = await db.execute(sql`select whats_new_seen from "user" where id = ${id}`);
  return (rows[0] as { whats_new_seen: number }).whats_new_seen;
}

async function setSeen(id: string, seen: number) {
  await db.execute(sql`update "user" set whats_new_seen = ${seen} where id = ${id}`);
}

describe("what's new seen", () => {
  let fay: string;
  beforeAll(async () => {
    fay = await mkUser("u_fay", "Fay");
  });

  it("starts a member who predates it at 0", async () => {
    // mkUser leaves the column out, as the migration does for existing rows.
    const gus = await mkUser(`u_gus_${crypto.randomUUID()}`, "Gus");
    expect(await seenOf(gus)).toBe(0);
  });

  it("moves forward to the newest id the popup showed", async () => {
    await setSeen(fay, 0);
    await markWhatsNewSeen(fay, LATEST_RELEASE_ID);
    expect(await seenOf(fay)).toBe(LATEST_RELEASE_ID);
  });

  it("never moves back, so a stale tab can't un-see newer entries", async () => {
    await setSeen(fay, LATEST_RELEASE_ID);
    await markWhatsNewSeen(fay, 1);
    expect(await seenOf(fay)).toBe(LATEST_RELEASE_ID);
  });

  it("stops at the latest release, so no one can skip future entries", async () => {
    await setSeen(fay, 0);
    await markWhatsNewSeen(fay, LATEST_RELEASE_ID + 50);
    expect(await seenOf(fay)).toBe(LATEST_RELEASE_ID);
  });

  it("refuses a user that doesn't exist", async () => {
    await expect(markWhatsNewSeen("u_nobody", 1)).rejects.toThrow("not-found");
  });
});
