# Meetings & Meal Sign-ups Implementation Plan (Plan 3 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the app's headline ritual end to end — a group creates weekly meetings, saves reusable recipes, sets a week's meal from one, and members claim the individual items they'll bring.

**Architecture:** Three new domain modules (`meetings.ts`, `recipes.ts`, `meals.ts`) hold all logic behind DAL guards, exactly as `groups.ts` does today: they take an explicit `userId` first parameter, never read headers, check membership themselves, and throw the shared error vocabulary. Server actions stay thin (resolve actor → call domain → map error → revalidate). One-claimer-per-item is a database guarantee (`item_claims.item_id` is the primary key), not application logic. Selecting a recipe **copies** its items into the meal plan so later recipe edits never rewrite past weeks.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle + Postgres 17, Better Auth (organization plugin), Tailwind v4 + shadcn/ui, Vitest (integration against Docker Postgres), Playwright.

**Spec:** `docs/superpowers/specs/2026-08-01-meetings-and-meals-design.md` (and its parent, `docs/superpowers/specs/2026-07-02-small-group-pwa-design.md`). Executors read both.

## Global Constraints

- Next.js 16 App Router + TypeScript. Mutations are **server actions only**; GET renders must never write.
- All DB access through `src/db/client.ts`. Schema entrypoint is `src/db/schema.ts` (app tables appended there; `auth-schema.ts` is generated, never hand-edited). Migrations via `mise run db:generate` then `mise run db:migrate` — never hand-write SQL.
- **Authorization rule:** every query and mutation is scoped by group membership, enforced **server-side** in the domain module — never trusted from the client. A client-supplied `groupId`/`meetingId`/`itemId` is only ever a lookup key that the domain re-authorizes against the actor.
- **Permissions** (from the spec):
  | Action | Who |
  |---|---|
  | Create a meeting; set/change its meal; add ad-hoc items; claim/release items | Any member of the group |
  | Create, edit, delete recipes | Any member of the group |
  | Edit or delete a meeting | Its creator, or an admin |
  | Remove an ad-hoc item (while unclaimed) | The member who added it, or an admin |
  | Release a claim | The claimer only |
- **Error vocabulary** — domain functions throw `Error` with exactly these messages: `"forbidden"`, `"not-found"`, `"already-claimed"`, `"not-claimed"`. Actions map them to copy; anything else rethrows to the error boundary.
- **Hearth fidelity:** tokens/utilities only, never a hardcoded color that has a token. Available: `bg-card`, `rounded-card`, `shadow-card`, `rounded-input`, `rounded-chip`, `rounded-sheet`, `min-h-tap`, `bg-primary`, `text-primary-foreground`, `text-accent-strong`, `bg-accent-tint`, `bg-surface-tint`, `text-strong`, `text-tertiary`, `text-muted-foreground`, `border-border`, `border-divider`, `border-slot-dashed`, `bg-avatar`, `text-avatar-foreground`, `bg-success`, `text-destructive`, `tracking-label`, `font-serif`. Component recipes are in the comment block in `src/app/globals.css` — the inline "Claim button" recipe is `bg-primary text-primary-foreground font-bold text-sm rounded-full px-3.5 py-1.5`.
- **Membership guards:** `src/lib/membership.ts` owns `getMembership`, `requireMembership(userId, groupId)`, and `requireAdminMembership(userId, groupId)`. Domain modules **import these — never re-implement them**. (They live in the domain layer, not middleware: authorization here is per-resource, and middleware only sees a URL, so it cannot know which group a `/meetings/<id>` request touches or which row a server action is about.) The session-aware wrappers that resolve *who the caller is* stay in `src/lib/dal.ts`.
- **Data access:** Drizzle's query builder (`db.select` / `insert` / `update` / `delete`) with explicit joins. The relational query API (`db.query.*`) is **deliberately not enabled** — do not pass `schema` to `drizzle()` in `src/db/client.ts`, and do not add `relations()` for app tables. Nested reads (a recipe with its items, a meal plan with its items and claims) assemble their result from explicit joins inside the domain module.
- **Copy:** sentence case, no exclamation marks, verb-first buttons.
- **Input validation:** no zod. Server actions validate their own inputs the way the four existing action files already do — trim, check required fields, return an inline message — plus an explicit format check on anything the database would reject (notably the `YYYY-MM-DD` date). Adopting a schema library is a separate, whole-codebase decision, not something to introduce piecemeal here.
- **Mobile-first (binding — see the parent spec's "Mobile-first experience"):** claim/release is optimistic; the meeting page refetches on window focus; dates use `<input type="date">`; the recipe form is keyboard-aware (`enterKeyHint`); long labels wrap rather than truncate; destructive confirms keep the destructive control clear of the opening button's tap path. **Every task that ships UI verifies it at a 390×844 viewport before reporting done.**
- **Tests green at every commit:** `mise run lint && mise run typecheck && mise run test`; add `mise run build && mise run e2e` where a task says so. Integration tests need Postgres: **Docker Desktop must be running**, then `mise run db:up`.
- **Trunk-based:** one PR per task, branched off `main`. **NO** `Co-Authored-By`/Claude trailers on commits. **Agents never merge** — each task stops at PR-ready; the user merges; the next task starts from the updated `main`.
- **Machine notes:** `git push` and `gh` need the Bash sandbox override (`dangerouslyDisableSandbox: true`) and may need `gh auth switch --user sameer-mall` (the default account lacks push access). `next build` also needs the override (it fetches Google Fonts). Kill any stale `next-server` on port 3000 before `e2e`. `rm -rf .next` if typecheck trips on stale generated route types.

---

### Task 1: Meetings schema + domain module

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/lib/meetings.ts`, `tests/integration/meetings.test.ts`
- Create (generated): `drizzle/00XX_*.sql`

**Interfaces:**
- Consumes: `db` from `@/db/client`; `getMembership` from `@/lib/groups`; `organization`, `user` from `@/db/auth-schema`.
- Produces (later tasks call these exactly):
  - `createMeeting(userId: string, groupId: string, input: { title: string; date: string }): Promise<{ meetingId: string }>`
  - `listMeetings(groupId: string): Promise<Meeting[]>` — **all meetings, date ascending.** Deliberately clock-free: whether a meeting is "upcoming" or "past" depends on the *viewer's* timezone, which the server does not know, so that split happens in the UI (Task 2). This also keeps the ordering test deterministic.
  - `getMeeting(meetingId: string): Promise<Meeting | null>`
  - `updateMeeting(userId: string, meetingId: string, input: { title: string; date: string }): Promise<void>`
  - `deleteMeeting(userId: string, meetingId: string): Promise<void>`
  - `type Meeting = { id: string; groupId: string; title: string; date: string; createdBy: string }`
  - `date` is a date-only `YYYY-MM-DD` string (no time-of-day), matching `<input type="date">`.

- [x] **Step 1: Append the meetings table to `src/db/schema.ts`**

Add `date` to the existing `drizzle-orm/pg-core` import, then append:

```ts
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
```

- [x] **Step 2: Generate and apply the migration**

```bash
mise run db:up
mise run db:generate
mise run db:migrate
```

Expected: a new `drizzle/00XX_*.sql` creating `meetings`. Do not hand-edit it.

- [x] **Step 3: Write the failing tests**

`tests/integration/meetings.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { createGroup, getInviteCode, requestToJoin, approveRequest } from "@/lib/groups";
import {
  createMeeting, deleteMeeting, getMeeting, listMeetings, updateMeeting,
} from "@/lib/meetings";

async function mkUser(id: string, name = id) {
  await db.execute(sql`insert into "user" (id, name, email, email_verified, created_at, updated_at)
    values (${id}, ${name}, ${id + "@example.com"}, true, now(), now()) on conflict do nothing`);
  return id;
}

// Adds `userId` to `groupId` as a plain member via the real join flow.
async function addMember(adminId: string, groupId: string, userId: string) {
  await requestToJoin(userId, await getInviteCode(groupId));
  const [req] = (await db.execute(
    sql`select id from join_requests where group_id = ${groupId} and user_id = ${userId} and status = 'pending'`,
  )).rows as { id: string }[];
  await approveRequest(adminId, req.id);
}

describe("meetings domain", () => {
  let alice: string, bob: string, carol: string;
  beforeAll(async () => {
    alice = await mkUser(`u_m_alice_${crypto.randomUUID()}`, "Alice");
    bob = await mkUser(`u_m_bob_${crypto.randomUUID()}`, "Bob");
    carol = await mkUser(`u_m_carol_${crypto.randomUUID()}`, "Carol");
  });

  it("a member can create a meeting; a non-member cannot", async () => {
    const { groupId } = await createGroup(alice, "Meeting makers");
    const { meetingId } = await createMeeting(alice, groupId, {
      title: "Week 12 — Romans 8",
      date: "2026-09-10",
    });
    const meeting = await getMeeting(meetingId);
    expect(meeting).toMatchObject({
      groupId, title: "Week 12 — Romans 8", date: "2026-09-10", createdBy: alice,
    });

    await expect(
      createMeeting(carol, groupId, { title: "Sneaky", date: "2026-09-11" }),
    ).rejects.toThrow("forbidden");
  });

  it("lists a group's meetings in date order", async () => {
    const { groupId } = await createGroup(alice, "Ordering");
    await createMeeting(alice, groupId, { title: "Third", date: "2026-03-01" });
    await createMeeting(alice, groupId, { title: "First", date: "2026-01-01" });
    await createMeeting(alice, groupId, { title: "Second", date: "2026-02-01" });

    const titles = (await listMeetings(groupId)).map((m) => m.title);
    expect(titles).toEqual(["First", "Second", "Third"]);
  });

  it("the creator or an admin can edit and delete; another member cannot", async () => {
    const { groupId } = await createGroup(alice, "Permissions");
    await addMember(alice, groupId, bob);
    await addMember(alice, groupId, carol);

    // Bob (a plain member) creates it, so he is the creator.
    const { meetingId } = await createMeeting(bob, groupId, { title: "Bob's night", date: "2026-09-17" });

    // Carol is a member but neither creator nor admin.
    await expect(
      updateMeeting(carol, meetingId, { title: "Hijacked", date: "2026-09-17" }),
    ).rejects.toThrow("forbidden");
    await expect(deleteMeeting(carol, meetingId)).rejects.toThrow("forbidden");

    // The creator can edit.
    await updateMeeting(bob, meetingId, { title: "Bob's night (moved)", date: "2026-09-18" });
    expect(await getMeeting(meetingId)).toMatchObject({
      title: "Bob's night (moved)", date: "2026-09-18",
    });

    // An admin can delete someone else's meeting.
    await deleteMeeting(alice, meetingId);
    expect(await getMeeting(meetingId)).toBeNull();
  });

  it("throws not-found for a meeting that does not exist", async () => {
    await expect(
      updateMeeting(alice, crypto.randomUUID(), { title: "Ghost", date: "2026-09-01" }),
    ).rejects.toThrow("not-found");
  });
});
```

- [x] **Step 4: Run the tests to verify they fail**

Run: `mise run test`
Expected: FAIL — cannot resolve `@/lib/meetings`.

- [x] **Step 5: Implement `src/lib/meetings.ts`**

```ts
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { meetings } from "@/db/schema";
import { getMembership } from "@/lib/groups";

export type Meeting = {
  id: string;
  groupId: string;
  title: string;
  date: string;
  createdBy: string;
};

async function requireMembership(userId: string, groupId: string) {
  const membership = await getMembership(groupId, userId);
  if (!membership) throw new Error("forbidden");
  return membership;
}

// Loads the meeting and confirms the actor may manage it: its creator, or an
// admin of its group. Any non-member fails the membership check first.
async function requireMeetingManager(userId: string, meetingId: string): Promise<Meeting> {
  const meeting = await getMeeting(meetingId);
  if (!meeting) throw new Error("not-found");
  const membership = await requireMembership(userId, meeting.groupId);
  if (meeting.createdBy !== userId && membership.role !== "admin") {
    throw new Error("forbidden");
  }
  return meeting;
}

export async function createMeeting(
  userId: string,
  groupId: string,
  input: { title: string; date: string },
): Promise<{ meetingId: string }> {
  await requireMembership(userId, groupId);
  const [row] = await db
    .insert(meetings)
    .values({ groupId, title: input.title, date: input.date, createdBy: userId })
    .returning({ id: meetings.id });
  return { meetingId: row.id };
}

export async function getMeeting(meetingId: string): Promise<Meeting | null> {
  const [row] = await db
    .select({
      id: meetings.id,
      groupId: meetings.groupId,
      title: meetings.title,
      date: meetings.date,
      createdBy: meetings.createdBy,
    })
    .from(meetings)
    .where(eq(meetings.id, meetingId));
  return row ?? null;
}

// Date ascending, and deliberately clock-free. "Upcoming" vs "past" depends on
// the viewer's local date, which this process does not know: the host runs UTC,
// where new Date() rolls over to tomorrow at 8pm US Eastern — dropping that
// evening's meeting into "past" while the group is still sitting in it. The
// split therefore belongs in the UI (Task 2), where the browser's timezone is
// known. Staying clock-free also makes this function's test deterministic.
export async function listMeetings(groupId: string): Promise<Meeting[]> {
  return db
    .select({
      id: meetings.id,
      groupId: meetings.groupId,
      title: meetings.title,
      date: meetings.date,
      createdBy: meetings.createdBy,
    })
    .from(meetings)
    .where(eq(meetings.groupId, groupId))
    .orderBy(asc(meetings.date));
}

export async function updateMeeting(
  userId: string,
  meetingId: string,
  input: { title: string; date: string },
): Promise<void> {
  await requireMeetingManager(userId, meetingId);
  await db
    .update(meetings)
    .set({ title: input.title, date: input.date })
    .where(eq(meetings.id, meetingId));
}

export async function deleteMeeting(userId: string, meetingId: string): Promise<void> {
  await requireMeetingManager(userId, meetingId);
  // The meal plan and its items/claims cascade from the FK chain.
  await db.delete(meetings).where(eq(meetings.id, meetingId));
}
```

- [x] **Step 6: Run the tests to verify they pass**

Run: `mise run test`
Expected: PASS — all prior suites plus the four new tests.

- [x] **Step 7: Full checks, branch, commit, PR**

```bash
mise run lint && mise run typecheck && mise run test
git checkout -b feat/meetings-domain
git add -A && git commit -m "Add meetings schema and domain module"
git push -u origin feat/meetings-domain
gh pr create --title "Add meetings schema and domain module" --fill
```

Stop at PR-ready. Do not merge.

---

### Task 2: Meetings list (3d/3e) + new-meeting sheet (3f)

**Files:**
- Create: `src/app/(app)/meetings/actions.ts`, `src/components/meeting-row.tsx`, `src/components/new-meeting-sheet.tsx`
- Modify: `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `createMeeting`, `listMeetings` (Task 1); `requireUser`, `resolveActiveGroup` from `@/lib/dal`; the existing `MeetingsEmpty` component.
- Produces: `createMeetingAction(groupId: string, prevState: ActionState, formData: FormData): Promise<ActionState>` and the `ActionState` type re-used from the group screen's convention (`{ error: string | null; success: boolean }`); a home page listing meetings and linking each to `/meetings/<id>`.

**Steps:**

- [x] **Step 1: Server action**

`src/app/(app)/meetings/actions.ts` — `"use server"`. Define `export type ActionState = { error: string | null; success: boolean }` (same shape as `src/app/(app)/group/actions.ts`, which is the established convention) and a `mapError` mapping `"forbidden"` → `"Only group members can do that."` and `"not-found"` → `"That didn't work — try refreshing the page."`, rethrowing anything else. `createMeetingAction(groupId, _prevState, formData)`: `requireUser()` → read and trim `title` and `date` → if either is empty return `{ error: "Add a title and a date.", success: false }` → **validate `date` against `/^\d{4}-\d{2}-\d{2}$/`** and return `{ error: "Enter a valid date.", success: false }` if it fails (a hand-crafted POST can send anything, and without this Postgres raises an invalid-input error the user sees as a 500 rather than a message) → `createMeeting(user.id, groupId, { title, date })` in try/catch → `revalidatePath("/")` → `{ error: null, success: true }`.

- [x] **Step 2: `MeetingRow` (part of screen 3d)**

Server component. A `Link` to `/meetings/<id>` styled as a card row: serif title (`font-serif text-lg font-semibold`), the date below in `text-muted-foreground text-sm`, formatted long-form (e.g. "Thursday, September 10"). **Long titles wrap** (no `truncate`). Row is `min-h-tap`.

- [x] **Step 3: `NewMeetingSheet` (screen 3f)**

Client component. A trigger button ("Plan a meeting", primary recipe, `min-h-tap`) opening the existing shadcn `Dialog` styled as a bottom sheet (`rounded-sheet`, anchored bottom). Inside, a `<form action={formAction}>` driven by `useActionState(createMeetingAction.bind(null, groupId), initialState)` with:
- `<input name="title" required>` using the Input recipe, `enterKeyHint="next"`.
- `<input name="date" type="date" required>` — **the native picker; do not build a calendar.**
- Submit button "Create meeting"; `state.error` rendered inline in `text-destructive text-xs`.
Close the sheet on `state.success` by adjusting state during render (the `handledState` pattern already used in `src/components/group-name-header.tsx`), not in an effect.

- [x] **Step 4: `MeetingList` — split upcoming from past in the viewer's timezone**

Client component taking `{ meetings, serverToday }`, where `meetings` is the date-ascending list from the domain. It renders an **Upcoming** group (soonest first) and a **Past** group (most recent first), each under an uppercase `tracking-label` heading, omitting an empty group. The cutoff lives in state:

```tsx
// getServerSnapshot supplies the value hydration must match; getSnapshot
// supplies the browser's real local date, and React re-renders once if they
// differ. This is what useSyncExternalStore is for — no effect, no setState,
// no lint suppression. "en-CA" formats as YYYY-MM-DD, the same shape the dates
// are stored in, so these compare as plain strings with no timezone conversion.
const subscribeToNothing = () => () => {};
const getLocalToday = () => new Date().toLocaleDateString("en-CA");

const today = useSyncExternalStore(subscribeToNothing, getLocalToday, () => serverToday);
```

Do **not** compute the cutoff on the server: the host runs UTC, so a meeting would move to "past" hours early for members in the Americas.

- [x] **Step 5: Wire the home page**

In `src/app/(app)/page.tsx`, after resolving `activeGroup`, call `listMeetings(activeGroup.id)`. If the list is empty render the existing `<MeetingsEmpty />`; otherwise render `<MeetingList meetings={meetings} serverToday={new Date().toISOString().slice(0, 10)} />`. Render `<NewMeetingSheet groupId={activeGroup.id} />` in both cases. Keep the pending-request cards exactly as they are.

- [x] **Step 6: Verify at a phone viewport**

Run `mise run dev`; drive the browser at **390×844**. Confirm: the sheet opens; the date field opens the OS picker; creating a meeting closes the sheet and shows the row; a long title wraps; **a meeting dated today appears under Upcoming, not Past**; the empty state still renders for a group with no meetings; no console errors and no hydration warning. Report exactly what was verified.

- [x] **Step 7: Full checks, branch, commit, PR** — `mise run lint && typecheck && test && build`; branch `feat/meetings-list`; title "Add meetings list and new-meeting sheet". Stop at PR-ready.

---

### Task 3: Meeting detail page + edit/delete

**Files:**
- Create: `src/app/(app)/meetings/[id]/page.tsx`, `src/components/meeting-actions-menu.tsx`
- Modify: `src/app/(app)/meetings/actions.ts`

**Interfaces:**
- Consumes: `getMeeting`, `updateMeeting`, `deleteMeeting` (Task 1); `requireMember` from `@/lib/dal`.
- Produces: the route `/meetings/<id>` that Task 8 fills with the meal section; `updateMeetingAction(meetingId, prevState, formData)` and `deleteMeetingAction(meetingId, prevState, formData)`.

**Steps:**

- [x] **Step 1: Actions**

Append to `src/app/(app)/meetings/actions.ts`. `updateMeetingAction`: `requireUser()` → validate title/date non-empty → `updateMeeting` in try/catch → `revalidatePath("/meetings/" + meetingId)` and `revalidatePath("/")`. `deleteMeetingAction`: `requireUser()` → `deleteMeeting` in try/catch → `revalidatePath("/")` → `redirect("/")` on success (outside the try, so the redirect's control-flow throw is not caught).

- [x] **Step 2: The page**

Server component. `const user = await requireUser()` → `const meeting = await getMeeting(id)` → if `!meeting` call `notFound()` → `const { role } = await requireMember(meeting.groupId)` (this is the group-scoping guard: a member of another group gets `forbidden`) → `const canManage = meeting.createdBy === user.id || role === "admin"`. Render the serif title, the long-form date, and — when `canManage` — `<MeetingActionsMenu>`. Leave a clearly marked slot where Task 8 mounts the meal section.

- [x] **Step 3: `MeetingActionsMenu`**

Client component using the existing shadcn `DropdownMenu` (⋯ trigger, `min-h-tap`, `aria-label="Meeting actions"`) with **Edit** and **Delete meeting** (`variant="destructive"`). Edit opens a Dialog containing the same title/date form as the sheet (prefilled). Delete opens a confirm Dialog: title "Delete this meeting?", body "Its meal plan and claims are deleted with it." — copy required by the spec's "deletion warns that its content goes with it". **Mobile:** in the confirm dialog, Cancel is the leftmost/default-focused control and the destructive button sits at the opposite end, away from where the menu item was tapped. Dispatch `useActionState` actions from `onClick` inside `startTransition(...)` (required — the codebase hit a React 19 error doing otherwise).

- [x] **Step 4: Verify at a phone viewport**

At **390×844**: open a meeting from the list; edit the title and see it update; confirm a non-creator/non-admin member sees no ⋯ menu; delete a meeting and land back on the list without it. Report what was verified.

- [x] **Step 5: Full checks, branch, commit, PR** — branch `feat/meeting-detail`; title "Add meeting detail page with edit and delete". Stop at PR-ready. *(Shipped together with Tasks 4 and 5 in one PR, at the user's request.)*

---

### Task 4: Recipes schema + domain module

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/lib/recipes.ts`, `tests/integration/recipes.test.ts`
- Create (generated): `drizzle/00XX_*.sql`

**Interfaces:**
- Produces:
  - `createRecipe(userId: string, groupId: string, input: { name: string; items: string[] }): Promise<{ recipeId: string }>`
  - `listRecipes(groupId: string): Promise<{ id: string; name: string; itemCount: number }[]>` — name ascending
  - `getRecipe(recipeId: string): Promise<{ id: string; groupId: string; name: string; createdBy: string; items: { id: string; label: string; position: number }[] } | null>` — items ordered by position
  - `updateRecipe(userId: string, recipeId: string, input: { name: string; items: string[] }): Promise<void>` — replaces the item list wholesale
  - `deleteRecipe(userId: string, recipeId: string): Promise<void>`

- [x] **Step 1: Append the tables**

Add `integer` to the `drizzle-orm/pg-core` import, then append:

```ts
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
  position: integer("position").notNull(),
});
```

- [x] **Step 2: Generate and apply the migration**

```bash
mise run db:generate && mise run db:migrate
```

- [x] **Step 3: Write the failing tests**

`tests/integration/recipes.test.ts` — reuse the `mkUser` helper shape from `tests/integration/meetings.test.ts` (repeated here because tasks may be read out of order):

```ts
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { createGroup } from "@/lib/groups";
import {
  createRecipe, deleteRecipe, getRecipe, listRecipes, updateRecipe,
} from "@/lib/recipes";

async function mkUser(id: string, name = id) {
  await db.execute(sql`insert into "user" (id, name, email, email_verified, created_at, updated_at)
    values (${id}, ${name}, ${id + "@example.com"}, true, now(), now()) on conflict do nothing`);
  return id;
}

describe("recipes domain", () => {
  let alice: string, outsider: string;
  beforeAll(async () => {
    alice = await mkUser(`u_r_alice_${crypto.randomUUID()}`, "Alice");
    outsider = await mkUser(`u_r_out_${crypto.randomUUID()}`, "Outsider");
  });

  it("creates a recipe with ordered items and reads it back", async () => {
    const { groupId } = await createGroup(alice, "Cooks");
    const { recipeId } = await createRecipe(alice, groupId, {
      name: "Taco night",
      items: ["2 lbs ground beef", "3 bags tortilla chips", "shredded cheese"],
    });

    const recipe = await getRecipe(recipeId);
    expect(recipe).toMatchObject({ groupId, name: "Taco night", createdBy: alice });
    expect(recipe!.items.map((i) => i.label)).toEqual([
      "2 lbs ground beef", "3 bags tortilla chips", "shredded cheese",
    ]);
    expect(recipe!.items.map((i) => i.position)).toEqual([0, 1, 2]);
  });

  it("lists a group's recipes by name with an item count", async () => {
    const { groupId } = await createGroup(alice, "Listing");
    await createRecipe(alice, groupId, { name: "Zucchini bake", items: ["zucchini"] });
    await createRecipe(alice, groupId, { name: "Apple crisp", items: ["apples", "oats"] });

    const list = await listRecipes(groupId);
    expect(list.map((r) => r.name)).toEqual(["Apple crisp", "Zucchini bake"]);
    expect(list.map((r) => r.itemCount)).toEqual([2, 1]);
  });

  it("updating replaces the whole item list", async () => {
    const { groupId } = await createGroup(alice, "Editing");
    const { recipeId } = await createRecipe(alice, groupId, {
      name: "Chili", items: ["beans", "beef"],
    });
    await updateRecipe(alice, recipeId, { name: "Chili (v2)", items: ["beans", "beef", "cornbread"] });

    const recipe = await getRecipe(recipeId);
    expect(recipe!.name).toBe("Chili (v2)");
    expect(recipe!.items.map((i) => i.label)).toEqual(["beans", "beef", "cornbread"]);
  });

  it("non-members cannot create, edit, or delete", async () => {
    const { groupId } = await createGroup(alice, "Sealed recipes");
    const { recipeId } = await createRecipe(alice, groupId, { name: "Secret", items: ["x"] });

    await expect(
      createRecipe(outsider, groupId, { name: "Intruder", items: ["y"] }),
    ).rejects.toThrow("forbidden");
    await expect(
      updateRecipe(outsider, recipeId, { name: "Hijacked", items: ["y"] }),
    ).rejects.toThrow("forbidden");
    await expect(deleteRecipe(outsider, recipeId)).rejects.toThrow("forbidden");
  });

  it("deleting removes the recipe and its items", async () => {
    const { groupId } = await createGroup(alice, "Deleting");
    const { recipeId } = await createRecipe(alice, groupId, { name: "Gone", items: ["a", "b"] });
    await deleteRecipe(alice, recipeId);

    expect(await getRecipe(recipeId)).toBeNull();
    const rows = (await db.execute(
      sql`select id from recipe_items where recipe_id = ${recipeId}`,
    )).rows;
    expect(rows).toHaveLength(0);
  });
});
```

- [x] **Step 4: Run the tests to verify they fail**

Run: `mise run test` → FAIL (cannot resolve `@/lib/recipes`).

- [x] **Step 5: Implement `src/lib/recipes.ts`**

Mirror `meetings.ts`: import `requireMembership` from `@/lib/membership` (do not write another copy), and add a private `requireRecipeMember(userId, recipeId)` that loads the recipe (throwing `"not-found"` when absent) and then checks membership of *its* group — this is what stops a member of group A editing group B's recipe. `createRecipe` and `updateRecipe` write the recipe row and its items **in one `db.transaction`**; `updateRecipe` deletes existing `recipeItems` for the recipe and re-inserts the new list with `position` = array index. `listRecipes` left-joins `recipeItems` with `count(...)::int` grouped by recipe, ordered by `asc(recipes.name)`. `getRecipe` returns `null` when missing and orders items by `asc(recipeItems.position)`.

- [x] **Step 6: Run the tests to verify they pass**

Run: `mise run test` → PASS.

- [x] **Step 7: Full checks, branch, commit, PR** — branch `feat/recipes-domain`; title "Add recipes schema and domain module". Stop at PR-ready. *(Shipped in the Task 3 PR.)*

---

### Task 5: Recipe library UI (3i / 3j / 3k)

**Files:**
- Create: `src/app/(app)/recipes/[id]/page.tsx`, `src/app/(app)/recipes/new/page.tsx`, `src/app/(app)/recipes/actions.ts`, `src/components/recipe-form.tsx`
- Modify: `src/app/(app)/recipes/page.tsx` (replaces the plan-2 "coming soon" screen)

**Interfaces:**
- Consumes: all of `@/lib/recipes` (Task 4); `requireUser`, `resolveActiveGroup`, `requireMember` from `@/lib/dal`.
- Produces: `createRecipeAction`, `updateRecipeAction`, `deleteRecipeAction`; a `RecipeForm` used by both the new and edit screens.

**Steps:**

- [x] **Step 1: Actions** — same skeleton as Task 2's: `requireUser()` → parse `name` plus the repeated `item` fields via `formData.getAll("item")`, trimming and dropping empties → validate name non-empty and at least one item, else return an inline error → domain call in try/catch → `revalidatePath("/recipes")` → for create/delete, `redirect` to `/recipes` (outside the try).

- [x] **Step 2: `RecipeForm` (screen 3k)** — client component taking `{ groupId, recipe? }`. Name input plus a dynamic list of item inputs (all named `item`), an "Add item" button appending a row, and a remove control per row. **Mobile:** every item input sets `enterKeyHint="next"`; the form's container has bottom padding clearing the fixed tab bar so the last field is never hidden behind it or the on-screen keyboard; inputs use the 16px Input recipe. Submit label is "Save recipe".

- [x] **Step 3: Library (3i)** — replace the placeholder in `src/app/(app)/recipes/page.tsx`: resolve the active group the same way `/group` does (`resolveActiveGroup`), `requireMember`, then `listRecipes`. Render a card list of name + "N items", each linking to `/recipes/<id>`, plus a primary "Add a recipe" link to `/recipes/new`. Empty state: serif "No recipes yet" and "Save a meal your group makes often, then use it to plan a week."

- [x] **Step 4: Detail (3j)** — `/recipes/[id]`: load with `getRecipe`, `notFound()` when null, `requireMember(recipe.groupId)` to scope it, then show the serif name, the ordered items, and edit/delete controls (delete behind a confirm Dialog with the same mobile tap-safety rule as Task 3).

- [x] **Step 5: Verify at a phone viewport** — at **390×844**: create a recipe with three items, see it in the library, edit it to add a fourth, delete it. Confirm the keyboard does not hide the active item field. Report what was verified.

- [x] **Step 6: Full checks, branch, commit, PR** — branch `feat/recipes-ui`; title "Add recipe library, detail, and form". Stop at PR-ready. *(Shipped in the Task 3 PR.)*

---

### Task 6: Meal plan schema + domain (set, change, ad-hoc)

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/lib/meals.ts`, `tests/integration/meals.test.ts`
- Create (generated): `drizzle/00XX_*.sql`

**Interfaces:**
- Produces:
  - `setMeal(userId: string, meetingId: string, recipeId: string): Promise<void>` — copies the recipe's items into the plan; **replaces** any existing plan (clearing its items and claims)
  - `getMealPlan(meetingId: string): Promise<MealPlan | null>`
  - `addAdhocItem(userId: string, meetingId: string, label: string): Promise<{ itemId: string }>`
  - `removeAdhocItem(userId: string, itemId: string): Promise<void>`
  - `type MealPlanItem = { id: string; label: string; position: number; source: "recipe" | "adhoc"; addedBy: string | null; addedByName: string | null; claimedBy: string | null; claimedByName: string | null }`
  - `type MealPlan = { meetingId: string; recipeId: string | null; recipeName: string | null; items: MealPlanItem[] }`

- [x] **Step 1: Append the tables**

```ts
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
```

- [x] **Step 2: Generate and apply the migration**

```bash
mise run db:generate && mise run db:migrate
```

- [x] **Step 3: Write the failing tests**

`tests/integration/meals.test.ts` — cover: setting a meal copies the recipe's items in order with `source: "recipe"`; **editing the recipe afterwards does not change the plan** (the copy guarantee); setting a different recipe clears the previous items *and their claims*; `addAdhocItem` records `addedBy` and appends after the recipe items; `removeAdhocItem` succeeds for the adder and for an admin, throws `"forbidden"` for another member, and throws `"forbidden"` when the item is already claimed; a non-member gets `"forbidden"` from `setMeal` and `addAdhocItem`. Use the `mkUser`/`addMember` helpers from Task 1's spec file (repeated inline — do not import across test files).

- [x] **Step 4: Run the tests to verify they fail** — `mise run test` → FAIL (cannot resolve `@/lib/meals`).

- [x] **Step 5: Implement the module**

`setMeal` runs in one `db.transaction`: load the meeting (`"not-found"` if absent) → check membership of its group with `requireMembership` from `@/lib/membership` (`"forbidden"`) → load the recipe and confirm it belongs to the **same group** (`"not-found"` otherwise — this stops another group's recipe being planted in your meeting) → `delete` any existing `mealPlanItems` for the meeting (claims cascade) → upsert the `mealPlans` row with the new `recipeId`/`setBy` → insert the recipe's items as copies with `source: "recipe"`, preserving `position`. `addAdhocItem` appends with `position` = current max + 1 and `source: "adhoc"`. `removeAdhocItem` loads the item, requires `source === "adhoc"`, requires the actor to be its `addedBy` or a group admin, and refuses when a claim exists. `getMealPlan` left-joins `itemClaims` and `user` (twice: adder and claimer) to return display names, ordered by `position`.

- [x] **Step 6: Run the tests to verify they pass** — `mise run test` → PASS.

- [x] **Step 7: Full checks, branch, commit, PR** — branch `feat/meal-plan-domain`; title "Add meal plan schema and domain module". Stop at PR-ready.

---

### Task 7: Claim and release (with a contention test)

**Files:**
- Modify: `src/lib/meals.ts`, `tests/integration/meals.test.ts`

**Interfaces:**
- Produces: `claimItem(userId: string, itemId: string): Promise<void>` — throws `"already-claimed"` if taken; `releaseItem(userId: string, itemId: string): Promise<void>` — throws `"not-claimed"` if the actor does not hold it.

- [x] **Step 1: Write the failing tests**

Append to `tests/integration/meals.test.ts`:

```ts
it("one member claims an item; a second claimer is rejected", async () => {
  const { groupId, meetingId, itemIds } = await seedPlan();   // helper defined in Task 6's tests
  await addMember(alice, groupId, bob);

  await claimItem(alice, itemIds[0]);
  await expect(claimItem(bob, itemIds[0])).rejects.toThrow("already-claimed");

  const plan = await getMealPlan(meetingId);
  expect(plan!.items[0].claimedBy).toBe(alice);
});

it("exactly one of many simultaneous claims wins", async () => {
  const { groupId, meetingId, itemIds } = await seedPlan();
  await addMember(alice, groupId, bob);
  await addMember(alice, groupId, carol);

  // Fire concurrently: the DB primary key is the arbiter, not app logic.
  const results = await Promise.allSettled([
    claimItem(alice, itemIds[0]),
    claimItem(bob, itemIds[0]),
    claimItem(carol, itemIds[0]),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  for (const rejected of results.filter((r) => r.status === "rejected")) {
    expect((rejected as PromiseRejectedResult).reason.message).toBe("already-claimed");
  }

  const plan = await getMealPlan(meetingId);
  expect(plan!.items[0].claimedBy).not.toBeNull();
});

it("only the claimer can release; releasing a free item throws", async () => {
  const { groupId, itemIds } = await seedPlan();
  await addMember(alice, groupId, bob);

  await claimItem(alice, itemIds[0]);
  await expect(releaseItem(bob, itemIds[0])).rejects.toThrow("not-claimed");
  await releaseItem(alice, itemIds[0]);
  await expect(releaseItem(alice, itemIds[0])).rejects.toThrow("not-claimed");
});
```

- [x] **Step 2: Run the tests to verify they fail** — `mise run test` → FAIL (`claimItem` is not exported).

- [x] **Step 3: Implement**

`claimItem`: load the item joined to its meeting (`"not-found"` if absent), check membership of that meeting's group (`"forbidden"`), then `insert` into `itemClaims`. **Catch the Postgres unique-violation (code `23505`) and rethrow as `new Error("already-claimed")`** — do not pre-check with a SELECT, which would reintroduce the race the primary key exists to close. `releaseItem`: `delete` from `itemClaims` `where itemId = ... and userId = ...` with `.returning({ itemId })`; if nothing came back, throw `"not-claimed"` (this covers both "not claimed at all" and "claimed by someone else" in one atomic statement).

- [x] **Step 4: Run the tests to verify they pass** — `mise run test` → PASS, including the concurrency test.

- [x] **Step 5: Full checks, branch, commit, PR** — branch `feat/meal-claims`; title "Add meal item claim and release". Stop at PR-ready.

---

### Task 8: Meal section UI with optimistic claim/release

**Files:**
- Create: `src/components/meal-section.tsx`, `src/components/meal-slot-row.tsx`, `src/components/recipe-picker.tsx`, `src/app/(app)/meals/actions.ts`
- Modify: `src/app/(app)/meetings/[id]/page.tsx`

**Interfaces:**
- Consumes: `getMealPlan`, `setMeal`, `claimItem`, `releaseItem` (Tasks 6–7); `listRecipes` (Task 4).
- Produces: the meal section mounted in the Task 3 slot; `setMealAction`, `claimItemAction`, `releaseItemAction`.

**Steps:**

- [x] **Step 1: Actions** — `"use server"`, same skeleton and `ActionState` shape as prior tasks. Map `"already-claimed"` → `"Someone just claimed that one."`, `"not-claimed"` → `"That isn't yours to release."`, `"forbidden"` → `"Only group members can do that."`, `"not-found"` → `"That didn't work — try refreshing the page."`. Every action ends with `revalidatePath("/meetings/" + meetingId)`.

- [x] **Step 2: No-meal state and `RecipePicker` (screen 3g)** — when `getMealPlan` returns null, render the serif "No meal planned yet" with body "Pick a recipe and its items become claimable slots." plus a picker: a Dialog listing the group's recipes (name + item count, each `min-h-tap`); choosing one calls `setMealAction`.

- [x] **Step 3: `MealSlotRow` — the optimistic claim (the core interaction)** — client component per item. Per the Hearth notes: unclaimed shows a dashed avatar (`border-slot-dashed`) and a terracotta **Claim** pill (inline recipe: `bg-primary text-primary-foreground font-bold text-sm rounded-full px-3.5 py-1.5`, wrapped in a `min-h-tap` hit area); claimed by you shows a **Release** link; claimed by someone else shows their initials avatar and name. Ad-hoc items add "added by \<name\>" in `text-tertiary text-xs`. **Labels wrap; never truncate.**

  **Mobile requirement — optimistic:** the row uses `useOptimistic` so a tap flips the slot's state immediately, then dispatches the action inside `startTransition`. When the action returns an error, the optimistic value is discarded (React reverts it when the transition settles) and the mapped message renders inline under the row. This is not a later polish pass: a cellular round trip must never gate the visual response.

- [x] **Step 4: `MealSection` + refetch on focus** — server component composing the recipe name header, the ordered slot rows, and (Task 9) the ad-hoc control. Mount it in the meeting page's slot. Add a tiny client component that calls `router.refresh()` on `window` `focus` (and on `visibilitychange` to `visible`), so a phone returning from the background never shows stale claims. Keep it to that one responsibility.

- [x] **Step 5: Verify at a phone viewport** — at **390×844**, with **two browser contexts** (two signed-in members): set a meal from a recipe; claim an item in context A and confirm the pill flips instantly; confirm context B sees it after a focus-triggered refresh; attempt to claim the same item from B and confirm the inline "Someone just claimed that one." message and that the row settles to the true state; release from A. Report exactly what was verified and anything that could not be.

- [x] **Step 6: Full checks, branch, commit, PR** — `lint`, `typecheck`, `test`, `build`; branch `feat/meal-signup-ui`; title "Add meal sign-up section with optimistic claiming". Stop at PR-ready.

---

### Task 9: Ad-hoc items and changing the recipe

**Files:**
- Create: `src/components/add-adhoc-item.tsx`, `src/components/change-meal-dialog.tsx`
- Modify: `src/components/meal-section.tsx`, `src/app/(app)/meals/actions.ts`

**Interfaces:**
- Consumes: `addAdhocItem`, `removeAdhocItem` (Task 6), `setMeal` (Task 6).
- Produces: `addAdhocItemAction`, `removeAdhocItemAction`; the change-recipe flow.

**Steps:**

- [ ] **Step 1: Actions** — `addAdhocItemAction(meetingId, prevState, formData)` validates a non-empty trimmed `label` (else "Add a name for the item.") and calls the domain; `removeAdhocItemAction(meetingId, itemId, ...)` maps `"forbidden"` → `"Only the person who added it, or an admin, can remove it."`.

- [ ] **Step 2: `AddAdhocItem`** — client component: a single labelled input (Input recipe, `enterKeyHint="done"`) plus an "Add item" button, appended below the slot list. On success the input clears. The row it creates is claimable like any other and notes "added by \<name\>".

- [ ] **Step 3: Remove control** — on ad-hoc rows only, visible to the adder or an admin, and only while the item is unclaimed (the domain enforces this regardless of what the UI shows).

- [ ] **Step 4: `ChangeMealDialog`** — a "Change recipe" control on the meal header opening a confirm Dialog. When the plan has at least one claim, the body must warn before proceeding: "This clears the current items and everyone's claims." Confirming calls `setMealAction` with the newly chosen recipe. Same mobile tap-safety rule as Task 3's destructive confirm.

- [ ] **Step 5: Verify at a phone viewport** — at **390×844**: add "brownies", claim it, confirm the adder cannot remove it while claimed, release and remove it; change the recipe on a plan with claims and confirm the warning appears and the slots reset. Report what was verified.

- [ ] **Step 6: Full checks, branch, commit, PR** — branch `feat/adhoc-items`; title "Add ad-hoc meal items and recipe changing". Stop at PR-ready.

---

### Task 10: End-to-end smoke + plan close-out

**Files:**
- Create: `e2e/meals.spec.ts`
- Modify: `docs/superpowers/specs/2026-07-02-small-group-pwa-design.md` (status line)

**Interfaces:**
- Consumes: everything above; the existing `signIn` helper pattern in `e2e/auth-groups.spec.ts` (file email transport via `AUTH_EMAIL_FILE`).
- Produces: the spec's required Playwright smoke — "set a meal & claim items".

- [ ] **Step 1: Write the spec**

`e2e/meals.spec.ts`. Copy the `signIn` helper and the `expectApp` configured expect from `e2e/auth-groups.spec.ts` (do not import across spec files). One test: sign in → create a group → create a recipe with two items → create a meeting → open it → set the meal from that recipe → claim the first item and assert it shows as yours → release it and assert the Claim pill returns. Use unique per-run values (`Date.now()`) so re-runs never collide.

- [ ] **Step 2: Run the full suite**

```bash
mise run db:up && mise run build && mise run e2e
```

Expected: all three specs pass (`home`, `auth-groups`, `meals`). If the new test pushes the run near the per-test budget, note it — `playwright.config.ts` already allows 90s per test and retains a trace on failure.

- [ ] **Step 3: Update the spec status**

Change the parent spec's status line to reflect that plans 1–3 are implemented.

- [ ] **Step 4: Full checks, branch, commit, PR** — `lint`, `typecheck`, `test`, `build`, `e2e`; branch `feat/meals-e2e`; title "Add meal sign-up e2e smoke". Stop at PR-ready.

---

## Plan Self-Review (completed)

- **Spec coverage:** meetings CRUD with creator-or-admin permissions (Tasks 1–3); recipe library group-shared (4–5); meal set/change with copy-on-set (6); ad-hoc items with adder-or-admin removal (9); claim/release with DB-enforced uniqueness and a contention test (7); claim race, ordering (upcoming-first), and the meal-only meeting page all map to tasks. Mobile-first obligations are attached to the tasks that build each flow — optimistic claiming (8), refetch on focus (8), native date input (2), keyboard-aware recipe form (5), wrapping labels (2, 8), destructive tap-safety (3, 5, 9) — with a phone-viewport verification step in every UI task. Testing section satisfied by Tasks 1/4/6/7 (integration) and 10 (Playwright smoke).
- **Placeholder scan:** no TBDs. Domain modules and tests carry real code; UI tasks carry binding interface/design specs rather than full JSX, matching the altitude accepted for plan 2's UI tasks (6–8) — each still names exact files, components, copy, tokens, and verification.
- **Type consistency:** `userId` is the first parameter of every domain function (matching `groups.ts`, where the plan-2 rename from `actorId` landed). `date` is a `YYYY-MM-DD` string in the schema, the domain, and `<input type="date">`. `ActionState` is `{ error: string | null; success: boolean }` in every actions file. `MealPlanItem.source` is `"recipe" | "adhoc"` in both the schema enum and the type. `getMealPlan` returns `MealPlan | null` and is consumed as nullable in Task 8.
- **Timezone correctness:** dates are date-only `YYYY-MM-DD` strings with no instant and no conversion, so they read identically in every timezone. The one place a clock is needed — the upcoming/past cutoff — is computed in the browser (Task 2), because a UTC server is already a day ahead of US members by early evening.
- **Known gap, deliberate:** deleting a recipe sets `mealPlans.recipeId` to null rather than cascading, so past weeks keep their copied items — the copy guarantee is tested in Task 6.
