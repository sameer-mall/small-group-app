import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

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
});
