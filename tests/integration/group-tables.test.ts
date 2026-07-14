import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

describe("group schema", () => {
  it("migrated org + app tables", async () => {
    const result = await db.execute(sql`
      select table_name from information_schema.tables
      where table_schema = 'public'
        and table_name in ('organization', 'member', 'join_requests', 'invite_codes')
      order by table_name
    `);
    expect(result.rows.map((r) => r.table_name)).toEqual([
      "invite_codes",
      "join_requests",
      "member",
      "organization",
    ]);
  });

  it("enforces one pending request per user per group", async () => {
    // Note: unlike the brief's assumption, Better Auth's generated columns in
    // this project are snake_case (e.g. "email_verified", "created_at"), not
    // camelCase-quoted — matching what @better-auth/cli actually generated
    // into src/db/auth-schema.ts. SQL below mirrors the real column names.
    await db.execute(sql`insert into "user" (id, name, email, email_verified, created_at, updated_at)
      values ('u_t4', 'Test', 't4@example.com', true, now(), now()) on conflict do nothing`);
    await db.execute(sql`insert into organization (id, name, slug, created_at)
      values ('g_t4', 'G', 'g-t4', now()) on conflict do nothing`);
    await db.execute(sql`delete from join_requests where user_id = 'u_t4'`);
    // join_requests.id has no DB-level default (it's a Drizzle $defaultFn,
    // applied only when inserting through the Drizzle query builder), so raw
    // SQL inserts must supply an id explicitly. Using two distinct ids here
    // also proves the failure below comes from the partial unique index on
    // (group_id, user_id) WHERE status = 'pending', not from a PK collision.
    await db.execute(
      sql`insert into join_requests (id, group_id, user_id) values ('jr_t4_1', 'g_t4', 'u_t4')`,
    );
    await expect(
      db.execute(
        sql`insert into join_requests (id, group_id, user_id) values ('jr_t4_2', 'g_t4', 'u_t4')`,
      ),
    ).rejects.toThrow();
  });
});
