// Single schema entrypoint (CLAUDE.md convention). Better Auth tables are
// generated into auth-schema.ts by `@better-auth/cli generate` — regenerate
// there, never hand-edit. App tables are defined below in this file.
import { sql } from "drizzle-orm";
import { date, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "./auth-schema";

export * from "./auth-schema";

export const joinRequests = pgTable(
  "join_requests",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    groupId: text("group_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "approved", "denied"] }).notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    respondedAt: timestamp("responded_at"),
    respondedBy: text("responded_by").references(() => user.id),
  },
  (t) => [
    // one open request per user per group; denied users may request again
    uniqueIndex("join_requests_pending_unique")
      .on(t.groupId, t.userId)
      .where(sql`${t.status} = 'pending'`),
  ],
);

export const inviteCodes = pgTable("invite_codes", {
  groupId: text("group_id").primaryKey().references(() => organization.id, { onDelete: "cascade" }),
  code: text("code").notNull().unique(),
  rotatedAt: timestamp("rotated_at").notNull().defaultNow(),
});

export const meetings = pgTable("meetings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  groupId: text("group_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  // Date-only: the group knows what time it meets. `mode: "string"` keeps this
  // a YYYY-MM-DD string end to end, which is exactly what <input type="date">
  // reads and writes — no timezone conversion anywhere.
  date: date("date", { mode: "string" }).notNull(),
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
