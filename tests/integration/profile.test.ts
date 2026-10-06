import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { updateDisplayName } from "@/lib/profile";

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
