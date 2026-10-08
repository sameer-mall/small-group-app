import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auth } from "@/lib/auth";
import { LATEST_RELEASE_ID } from "@/lib/whats-new";

describe("a new account and what's new", () => {
  it("starts caught up, so a new member never gets a backlog", async () => {
    // internalAdapter.createUser is the path every sign-up takes (emailed code
    // or Google), database hooks included.
    const ctx = await auth.$context;
    const created = await ctx.internalAdapter.createUser({
      email: `new-${crypto.randomUUID()}@example.com`,
      name: "",
      emailVerified: true,
    });
    const { rows } = await db.execute(
      sql`select whats_new_seen from "user" where id = ${created.id}`,
    );
    expect((rows[0] as { whats_new_seen: number }).whats_new_seen).toBe(LATEST_RELEASE_ID);
  });
});
