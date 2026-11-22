import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { passkey } from "@/db/schema";

describe("better auth schema", () => {
  it("migrated the core auth tables", async () => {
    const result = await db.execute(sql`
      select table_name from information_schema.tables
      where table_schema = 'public'
        and table_name in ('user', 'session', 'account', 'verification')
      order by table_name
    `);
    expect(result.rows.map((r) => r.table_name)).toEqual([
      "account",
      "session",
      "user",
      "verification",
    ]);
  });

  it("has a passkey table that goes away with its user", async () => {
    const userId = `u_pk_${crypto.randomUUID()}`;
    await db.execute(sql`insert into "user" (id, name, email, email_verified, created_at, updated_at)
      values (${userId}, 'Pat', ${userId + "@example.com"}, true, now(), now())`);
    await db.insert(passkey).values({
      id: `pk_${crypto.randomUUID()}`,
      name: "iPhone",
      publicKey: "pk",
      userId,
      credentialID: `cred_${crypto.randomUUID()}`,
      counter: 0,
      deviceType: "multiDevice",
      backedUp: true,
      transports: "internal",
      createdAt: new Date(),
    });
    await db.execute(sql`delete from "user" where id = ${userId}`);
    const { rows } = await db.execute(sql`select count(*)::int as n from passkey where user_id = ${userId}`);
    expect((rows[0] as { n: number }).n).toBe(0);
  });
});
