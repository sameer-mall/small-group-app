// Single schema entrypoint (CLAUDE.md convention). Better Auth tables are
// generated into auth-schema.ts by `@better-auth/cli generate` — regenerate
// there, never hand-edit. App tables are defined below in this file.
import { sql } from "drizzle-orm";
import { boolean, date, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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

export const recipes = pgTable("recipes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  groupId: text("group_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const recipeItems = pgTable("recipe_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  recipeId: text("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  // Zero-based index into the recipe's item list; rewritten wholesale on edit.
  position: integer("position").notNull(),
});

export const mealPlans = pgTable("meal_plans", {
  // One plan per meeting at most, so the meeting id *is* the key.
  meetingId: text("meeting_id").primaryKey().references(() => meetings.id, { onDelete: "cascade" }),
  // Null once the source recipe is deleted — the copied items still stand.
  recipeId: text("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
  setBy: text("set_by").notNull().references(() => user.id),
  setAt: timestamp("set_at").notNull().defaultNow(),
});

export const mealPlanItems = pgTable("meal_plan_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  meetingId: text("meeting_id").notNull().references(() => mealPlans.meetingId, { onDelete: "cascade" }),
  label: text("label").notNull(),
  position: integer("position").notNull(),
  // Copies of recipe items vs. extras added to this week only.
  source: text("source", { enum: ["recipe", "adhoc"] }).notNull(),
  // Set for ad-hoc items (who added it); null for copied recipe items.
  addedBy: text("added_by").references(() => user.id),
});

export const itemClaims = pgTable("item_claims", {
  // The primary key IS the one-claimer-per-item guarantee: a second claim on
  // the same item is a duplicate-key error from Postgres, not a check the
  // application could race past.
  itemId: text("item_id").primaryKey().references(() => mealPlanItems.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  claimedAt: timestamp("claimed_at").notNull().defaultNow(),
});

export const prayerSessions = pgTable("prayer_sessions", {
  // One bowl per meeting, ever — after the draw it stays as that night's
  // record — so the meeting id *is* the key, as it is for meal_plans.
  meetingId: text("meeting_id").primaryKey().references(() => meetings.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["open", "drawn"] }).notNull().default("open"),
  // Whoever joined or wrote first: the bowl starts itself on that first write.
  startedBy: text("started_by").notNull().references(() => user.id),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  drawnBy: text("drawn_by").references(() => user.id),
  drawnAt: timestamp("drawn_at"),
});

export const prayerParticipants = pgTable(
  "prayer_participants",
  {
    meetingId: text("meeting_id")
      .notNull()
      .references(() => prayerSessions.meetingId, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.meetingId, t.userId] })],
);

export const prayerRequests = pgTable(
  "prayer_requests",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => prayerSessions.meetingId, { onDelete: "cascade" }),
    authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    // The author's choice, like signing the paper. Off unless they opt in.
    includeName: boolean("include_name").notNull().default(false),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  // One request per person per bowl.
  (t) => [uniqueIndex("prayer_requests_one_per_author").on(t.meetingId, t.authorId)],
);

export const prayerAssignments = pgTable(
  "prayer_assignments",
  {
    // Each request is drawn by exactly one person…
    requestId: text("request_id")
      .primaryKey()
      .references(() => prayerRequests.id, { onDelete: "cascade" }),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => prayerSessions.meetingId, { onDelete: "cascade" }),
    assigneeId: text("assignee_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  },
  // …and each person draws exactly one.
  (t) => [uniqueIndex("prayer_assignments_one_per_assignee").on(t.meetingId, t.assigneeId)],
);

// A private note belongs to its author, not to the meeting: it shows on its
// meeting while that exists, and outlives it — deleting a meeting must never
// cost anyone their notes (the owner's call; it departs from the parent
// spec's data model). So the note carries what it needs to stand alone: its
// own id, its group for scoping, and a snapshot of the meeting's title and
// date, refreshed on every save.
export const notes = pgTable(
  "notes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    groupId: text("group_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Null once the meeting is deleted.
    meetingId: text("meeting_id").references(() => meetings.id, { onDelete: "set null" }),
    meetingTitle: text("meeting_title").notNull(),
    meetingDate: date("meeting_date", { mode: "string" }).notNull(),
    authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    // Stored exactly as typed (line endings normalized by the action):
    // autosave fires mid-sentence, so trimming would eat what's being typed.
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  // One note per member per live meeting. Postgres treats NULLs as distinct,
  // so any number of notes whose meetings were deleted coexist.
  (t) => [
    uniqueIndex("notes_one_per_author").on(t.meetingId, t.authorId),
    // Speeds up listMyNotes, which always filters by author then group.
    index("notes_by_author_group").on(t.authorId, t.groupId),
  ],
);
