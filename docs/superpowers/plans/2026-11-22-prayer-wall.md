# Prayer Wall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the meeting's sealed prayer bowl with a prayer wall the whole group reads as requests come in, keeping "I'm in" and turning "Draw the bowl" into "Assign prayers" with private assignments.

**Architecture:** Same tables (`prayer_sessions`, `prayer_participants`, `prayer_requests`, `prayer_assignments`); one migration drops `prayer_requests.include_name`. `src/lib/prayers.ts` keeps its guarded transactions and is renamed to wall vocabulary, with a new read model `getPrayerWall` that returns every request (current members only) but never another member's assignment. The wall moves to its own route `/meetings/[id]/prayers`; the meeting page shows a preview card and the home meeting row a request-count chip. One new push on assign.

**Tech Stack:** Next.js App Router (server actions, `after()`), Drizzle + Postgres, zod v4, Tailwind + shadcn/ui (Hearth tokens), Vitest, Playwright, mise.

**Spec:** `docs/superpowers/specs/2026-11-22-prayer-wall-design.md` (read it; it includes the side-thread revision keeping "I'm in"). Screens: canvas https://claude.ai/artifact/Fo1qF5iZ6Z5ktYZkqRvPrX, artboards 1–4 and A–C.

## Global Constraints

- All DB access through `src/db/client.ts`; schema in `src/db/schema.ts`.
- Server actions parse `FormData` with zod `safeParse`, return `form.error.issues[0].message`; call `logRefusal(err)` first in refusal mapping.
- Pushes: one `notify*` per event in `src/lib/notifications.ts`, ids only, scheduled with `after()` after the save succeeds; never awaited in the request.
- Every tappable element uses `Button` / `buttonVariants` with a fill or border (guard test `src/components/button-styling.test.ts`).
- No em dashes in any user-facing copy (UI strings, action errors, push text, What's new).
- Nothing sent to Sentry contains user content: ids and error codes only.
- What's new: new entry at the TOP of `src/lib/whats-new.ts`, next id (7), one or two sentences, no em dashes.
- Avatars render only through `<Avatar name image />` (`src/components/avatar.tsx`).
- Domain errors are plain `Error("forbidden" | "not-found" | "session-closed" | "too-few-requests" | "still-writing")`.
- Commands: `mise run db:up` before tests; `mise run test`, `mise run typecheck`, `mise run lint`, `mise run e2e` (run e2e on port 3300; see memory note on port conflicts). No Claude co-author trailer on commits.

## File map

| File | Responsibility |
|---|---|
| `src/db/schema.ts`, `drizzle/0010_*.sql` | drop `include_name`; comment that `drawn` means assigned |
| `src/lib/prayers.ts` | wall domain: join, leave, post, delete, assign, `getPrayerWall`, `listMyAssignedPrayers` |
| `src/lib/time-ago.ts` (+ test) | "2 min ago" formatting, pure |
| `src/lib/notifications.ts` (+ tests) | `prayersAssignedCopy`, `notifyPrayersAssigned` |
| `src/lib/journey.ts` (+ test) | wall's parent is its meeting |
| `src/lib/meetings.ts` | `listMeetings` gains `prayerRequestCount` |
| `src/app/(app)/prayers/actions.ts` | five actions, revalidation, `after()` push |
| `src/app/(app)/meetings/[id]/prayers/page.tsx` | the wall page |
| `src/components/prayer-wall.tsx` | client: stage (not in / writing / posted / editing), post form, I'm in / I'm out |
| `src/components/prayer-wall-feed.tsx` | server-renderable feed rows |
| `src/components/prayer-buckets.tsx` | restyled: Writing / Not joined rows |
| `src/components/assign-prayers-button.tsx` | gating captions + confirm dialog |
| `src/components/you-are-praying-for.tsx` | the assigned block |
| `src/components/prayer-preview-card.tsx` | meeting page card |
| `src/components/meeting-row.tsx` | home chip |
| `src/app/(app)/prayers/page.tsx`, `src/components/drawn-prayer-list.tsx` | My prayers copy, name always shown |
| Deleted | `prayer-section.tsx`, `open-prayer-bowl.tsx`, `prayer-compose.tsx`, `draw-bowl-button.tsx`, `drawn-prayer-bowl.tsx` |

---

### Task 1: Domain rename and drop `include_name`

**Files:**
- Modify: `src/db/schema.ts:92-131`
- Create: `drizzle/0010_<generated>.sql` (via `mise run db:generate`)
- Modify: `src/lib/prayers.ts`
- Modify: `src/app/(app)/prayers/actions.ts`
- Modify (imports only, deleted in Task 7): `src/components/open-prayer-bowl.tsx`, `src/components/prayer-compose.tsx`, `src/components/draw-bowl-button.tsx`, `src/components/drawn-prayer-bowl.tsx`, `src/components/drawn-prayer-list.tsx`, `src/app/(app)/prayers/page.tsx`
- Test: `tests/integration/prayers.test.ts`

**Interfaces:**
- Produces (in `src/lib/prayers.ts`):
  - `joinPrayerWall(userId: string, meetingId: string): Promise<void>`
  - `leavePrayerWall(userId: string, meetingId: string): Promise<void>`
  - `postPrayerRequest(userId: string, meetingId: string, input: { body: string }): Promise<void>`
  - `deletePrayerRequest(userId: string, meetingId: string): Promise<void>`
  - `assignPrayers(userId: string, meetingId: string): Promise<{ assigned: boolean }>`
  - `listMyAssignedPrayers(userId: string, groupId: string): Promise<AssignedPrayer[]>` with `type AssignedPrayer = { meetingId: string; meetingTitle: string; meetingDate: string; body: string; authorName: string }`
  - `getPrayerBowl` stays for now with `drawn: { body: string; authorName: string } | null` and `viewer.request: { body: string } | null` (removed in Task 7).
- Produces (actions): `joinPrayerWallAction`, `leavePrayerWallAction`, `postPrayerRequestAction`, `deletePrayerRequestAction`, `assignPrayersAction`, all `(meetingId: string, prev: ActionState, formData: FormData) => Promise<ActionState>`.

- [ ] **Step 1: Rewrite the integration tests to the new names**

In `tests/integration/prayers.test.ts`, change the import block to:

```ts
import {
  assignPrayers,
  deletePrayerRequest,
  getPrayerBowl,
  joinPrayerWall,
  leavePrayerWall,
  listMyAssignedPrayers,
  postPrayerRequest,
} from "@/lib/prayers";
```

Then apply these replacements across the file: `joinPrayerBowl(` → `joinPrayerWall(`, `leavePrayerBowl(` → `leavePrayerWall(`, `withdrawPrayerRequest(` → `deletePrayerRequest(`, `drawPrayerBowl(` → `assignPrayers(`, `listMyDrawnPrayers(` → `listMyAssignedPrayers(`, `{ drew: ` → `{ assigned: `, and `submitPrayerRequest(x, m, { body: B, includeName: … })` → `postPrayerRequest(x, m, { body: B })`. Every `request: { body, includeName }` expectation becomes `request: { body }`.

Replace the test "an unsigned request reaches its drawer without the writer's name or id" with:

```ts
  it("an assigned request always carries its writer's name, and never an id", async () => {
    const { meetingId } = await seedMeeting("Names always");
    await postPrayerRequest(alice, meetingId, { body: "From Alice" });
    await postPrayerRequest(bob, meetingId, { body: "From Bob" });
    await assignPrayers(alice, meetingId);
    const forBob = await getPrayerBowl(bob, meetingId);
    expect(forBob.drawn).toEqual({ body: "From Alice", authorName: "Alice" });
    expect(JSON.stringify(forBob)).not.toContain(alice);
  });
```

In the "my prayers" describe, every `authorName: null` expectation becomes the writer's name.

- [ ] **Step 2: Run and watch it fail**

Run: `mise run db:up && pnpm vitest run tests/integration/prayers.test.ts`
Expected: FAIL, `assignPrayers` (and the other new names) is not exported.

- [ ] **Step 3: Drop the column and record the status meaning**

In `src/db/schema.ts`, delete the `includeName` column and its comment from `prayerRequests`, and replace the comment above `prayerSessions` with:

```ts
// One prayer wall per meeting, ever: after prayers are assigned it stays as
// that night's record, so the meeting id *is* the key, as it is for
// meal_plans. status "drawn" means prayers have been assigned (and drawn_by /
// drawn_at record who and when); the names predate the wall and were kept to
// avoid a rename migration.
```

Run: `mise run db:generate`
Expected: a new `drizzle/0010_*.sql` containing exactly `ALTER TABLE "prayer_requests" DROP COLUMN "include_name";`. If it contains anything else, stop and inspect the schema diff.

- [ ] **Step 4: Rename the domain functions**

In `src/lib/prayers.ts`:

```ts
export async function joinPrayerWall(userId: string, meetingId: string): Promise<void> {
  await requireMeetingMember(userId, meetingId);
  await db.transaction(async (tx) => {
    await ensureBowl(tx, meetingId, userId);
    await lockOpenBowl(tx, meetingId);
    await ensureParticipant(tx, meetingId, userId);
  });
}

// One request per person per meeting, so posting again edits it. Posting also
// joins you: a request on the wall is the clearest possible "I'm in".
export async function postPrayerRequest(
  userId: string,
  meetingId: string,
  input: { body: string },
): Promise<void> {
  await requireMeetingMember(userId, meetingId);
  await db.transaction(async (tx) => {
    await ensureBowl(tx, meetingId, userId);
    await lockOpenBowl(tx, meetingId);
    await ensureParticipant(tx, meetingId, userId);
    await tx
      .insert(prayerRequests)
      .values({ meetingId, authorId: userId, body: input.body })
      .onConflictDoUpdate({
        target: [prayerRequests.meetingId, prayerRequests.authorId],
        set: { body: input.body, updatedAt: new Date() },
      });
  });
}
```

Rename `withdrawPrayerRequest` → `deletePrayerRequest`, `leavePrayerBowl` → `leavePrayerWall` (bodies unchanged). Rename `drawPrayerBowl` → `assignPrayers`, its return type to `Promise<{ assigned: boolean }>`, and its two returns to `{ assigned: false }` / `{ assigned: true }`; body otherwise unchanged (the `still-writing` check stays).

In `getPrayerBowl`: select own request as `{ body: prayerRequests.body }` only; select the assigned row without `includeName` and set `drawn = { body: assigned.body, authorName: assigned.authorName }`. Update the `PrayerBowl` type: `request: { body: string } | null` and `drawn: { body: string; authorName: string } | null`.

Replace `DrawnPrayer` / `listMyDrawnPrayers` with:

```ts
export type AssignedPrayer = {
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
  body: string;
  authorName: string;
};

// Every request this member has been assigned in this group, newest meeting
// first, so past weeks stay prayable. The assignee filter keeps it to the
// caller's own assignments.
export async function listMyAssignedPrayers(
  userId: string,
  groupId: string,
): Promise<AssignedPrayer[]> {
  await requireMembership(userId, groupId);
  return db
    .select({
      meetingId: meetings.id,
      meetingTitle: meetings.title,
      meetingDate: meetings.date,
      body: prayerRequests.body,
      authorName: user.name,
    })
    .from(prayerAssignments)
    .innerJoin(prayerRequests, eq(prayerRequests.id, prayerAssignments.requestId))
    .innerJoin(meetings, eq(meetings.id, prayerAssignments.meetingId))
    .innerJoin(user, eq(user.id, prayerRequests.authorId))
    .where(and(eq(prayerAssignments.assigneeId, userId), eq(meetings.groupId, groupId)))
    .orderBy(desc(meetings.date), desc(meetings.createdAt));
}
```

- [ ] **Step 5: Rename the actions**

In `src/app/(app)/prayers/actions.ts`: import the new names; delete `includeName` from `prayerRequestForm`; rename the five actions to `joinPrayerWallAction`, `postPrayerRequestAction`, `deletePrayerRequestAction`, `leavePrayerWallAction`, `assignPrayersAction`, calling the renamed domain functions. Update `mapError` copy:

```ts
    if (err.message === "session-closed") return "Prayers have already been assigned.";
    if (err.message === "too-few-requests") {
      return "Prayers can be assigned once two requests are in.";
    }
    if (err.message === "still-writing") {
      return "Prayers can be assigned once everyone who's in has posted.";
    }
```

- [ ] **Step 6: Keep the old UI compiling**

- `open-prayer-bowl.tsx`: import the renamed actions; drop `initialIncludeName` from the `PrayerCompose` call.
- `prayer-compose.tsx`: delete the `initialIncludeName` prop, the `includeName` state, `toggleLabelId`, and the whole "Include my name" row (label, switch, hidden input).
- `draw-bowl-button.tsx`: import `assignPrayersAction` and use it where `drawPrayerBowlAction` was.
- `drawn-prayer-bowl.tsx`: replace the `authorName ? … : "Name not shared"` branch with `<p className="text-muted-foreground text-center text-[14.5px]">From {drawn.authorName}</p>`.
- `drawn-prayer-list.tsx`: `import type { AssignedPrayer } from "@/lib/prayers"`, prop `prayers: AssignedPrayer[]`, and replace the name branch with `<span className="text-muted-foreground">From {prayer.authorName}</span>`.
- `src/app/(app)/prayers/page.tsx`: call `listMyAssignedPrayers`.

- [ ] **Step 7: Run tests and typecheck**

Run: `pnpm vitest run tests/integration/prayers.test.ts && mise run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/db/schema.ts drizzle src/lib/prayers.ts "src/app/(app)/prayers" src/components tests/integration/prayers.test.ts
git commit -m "Rename the prayer bowl domain to the wall and drop include_name"
```

---

### Task 2: `getPrayerWall` read model

**Files:**
- Modify: `src/lib/prayers.ts`
- Test: `tests/integration/prayers.test.ts` (new describe)

**Interfaces:**
- Consumes: Task 1 domain functions.
- Produces:

```ts
export type WallPerson = { userId: string; name: string };
export type WallRequest = {
  id: string;
  authorId: string;
  name: string;
  image: string | null;
  body: string;
  updatedAt: Date;
  isMine: boolean;
};
export type PrayerWall = {
  meetingId: string;
  status: "open" | "drawn";
  requests: WallRequest[]; // newest first, current members only
  writing: WallPerson[]; // joined, no request; current members; by name
  notJoined: WallPerson[]; // current members neither joined nor posted; by name
  viewerJoined: boolean;
  mine: { body: string } | null;
  assigned: { body: string; authorName: string; authorImage: string | null } | null;
  myRequestIsAssigned: boolean;
};
export function getPrayerWall(viewerId: string, meetingId: string): Promise<PrayerWall>;
```

- [ ] **Step 1: Write the failing tests**

Append to `tests/integration/prayers.test.ts` (add `getPrayerWall` to the import):

```ts
describe("prayer wall: what members read", () => {
  let alice: string, bob: string, carol: string, outsider: string;
  beforeAll(async () => {
    alice = await mkUser(`u_w_alice_${crypto.randomUUID()}`, "Alice");
    bob = await mkUser(`u_w_bob_${crypto.randomUUID()}`, "Bob");
    carol = await mkUser(`u_w_carol_${crypto.randomUUID()}`, "Carol");
    outsider = await mkUser(`u_w_out_${crypto.randomUUID()}`, "Outsider");
  });

  async function seedMeeting(name: string) {
    const { groupId } = await createGroup(alice, name);
    await addMember(alice, groupId, bob);
    await addMember(alice, groupId, carol);
    const { meetingId } = await createMeeting(alice, groupId, { title: name, date: "2026-11-26" });
    return { groupId, meetingId };
  }

  it("every member reads every request, newest first, with names", async () => {
    const { meetingId } = await seedMeeting("Wall read");
    await postPrayerRequest(alice, meetingId, { body: "A" });
    await postPrayerRequest(bob, meetingId, { body: "B" });
    const wall = await getPrayerWall(carol, meetingId);
    expect(wall.requests.map((r) => [r.name, r.body, r.isMine])).toEqual([
      ["Bob", "B", false],
      ["Alice", "A", false],
    ]);
    expect(wall.mine).toBeNull();
  });

  it("splits members into writing and not joined, and marks the viewer's own request", async () => {
    const { meetingId } = await seedMeeting("Wall buckets");
    await postPrayerRequest(alice, meetingId, { body: "A" });
    await joinPrayerWall(bob, meetingId);
    const wall = await getPrayerWall(alice, meetingId);
    expect(names(wall.writing)).toEqual(["Bob"]);
    expect(names(wall.notJoined)).toEqual(["Carol"]);
    expect(wall.viewerJoined).toBe(true);
    expect(wall.mine).toEqual({ body: "A" });
    expect(wall.requests[0].isMine).toBe(true);
  });

  it("a removed member's request leaves the wall", async () => {
    const { groupId, meetingId } = await seedMeeting("Wall removed");
    await postPrayerRequest(bob, meetingId, { body: "B" });
    await removeMember(alice, groupId, bob);
    const wall = await getPrayerWall(alice, meetingId);
    expect(wall.requests).toEqual([]);
  });

  it("after assigning, the viewer sees their own assignment and nobody else's", async () => {
    const { meetingId } = await seedMeeting("Wall assigned");
    await postPrayerRequest(alice, meetingId, { body: "A" });
    await postPrayerRequest(bob, meetingId, { body: "B" });
    await assignPrayers(alice, meetingId);
    const wall = await getPrayerWall(alice, meetingId);
    expect(wall.status).toBe("drawn");
    expect(wall.assigned).toEqual({ body: "B", authorName: "Bob", authorImage: null });
    expect(wall.myRequestIsAssigned).toBe(true);
    // Bob is Alice's assignee; that pairing must not reach Alice.
    const assigneeRows = (await db.execute(
      sql`select assignee_id from prayer_assignments where meeting_id = ${meetingId}`,
    )).rows as { assignee_id: string }[];
    expect(assigneeRows).toHaveLength(2);
    expect(JSON.stringify({ ...wall, requests: wall.requests.map(({ authorId: _, ...r }) => r) })).not.toContain(bob);
    const carolWall = await getPrayerWall(carol, meetingId);
    expect(carolWall.assigned).toBeNull();
    expect(carolWall.myRequestIsAssigned).toBe(false);
  });

  it("non-members cannot read the wall", async () => {
    const { meetingId } = await seedMeeting("Wall outsider");
    await expect(getPrayerWall(outsider, meetingId)).rejects.toThrow("forbidden");
  });
});
```

(`removeMember(adminId, groupId, userId)` is already imported at the top of the file; confirm its argument order against `src/lib/groups.ts` and adjust the call if it differs.)

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm vitest run tests/integration/prayers.test.ts -t "prayer wall: what members read"`
Expected: FAIL, `getPrayerWall` is not exported.

- [ ] **Step 3: Implement**

Add to `src/lib/prayers.ts` (`asc`, `desc`, `and`, `eq` are already imported):

```ts
// The read model behind the wall page and the meeting card. Every request is
// group-visible by design; what stays private is who was assigned whose, so
// the only assignment read here is filtered to the viewer.
export async function getPrayerWall(viewerId: string, meetingId: string): Promise<PrayerWall> {
  const meeting = await requireMeetingMember(viewerId, meetingId);

  const [[session], members, participants, requestRows, [assignedRow]] = await Promise.all([
    db
      .select({ status: prayerSessions.status })
      .from(prayerSessions)
      .where(eq(prayerSessions.meetingId, meetingId)),
    listMembers(meeting.groupId),
    db
      .select({ userId: prayerParticipants.userId })
      .from(prayerParticipants)
      .where(eq(prayerParticipants.meetingId, meetingId)),
    db
      .select({
        id: prayerRequests.id,
        authorId: prayerRequests.authorId,
        body: prayerRequests.body,
        updatedAt: prayerRequests.updatedAt,
      })
      .from(prayerRequests)
      .where(eq(prayerRequests.meetingId, meetingId))
      .orderBy(desc(prayerRequests.updatedAt), asc(prayerRequests.id)),
    db
      .select({ body: prayerRequests.body, authorName: user.name, authorImage: user.image })
      .from(prayerAssignments)
      .innerJoin(prayerRequests, eq(prayerRequests.id, prayerAssignments.requestId))
      .innerJoin(user, eq(user.id, prayerRequests.authorId))
      .where(
        and(eq(prayerAssignments.meetingId, meetingId), eq(prayerAssignments.assigneeId, viewerId)),
      ),
  ]);

  // Current members only: a removed member drops out of every list and their
  // words leave the wall.
  const byId = new Map(members.map((m) => [m.userId, m]));
  const requests: WallRequest[] = requestRows
    .filter((r) => byId.has(r.authorId))
    .map((r) => {
      const author = byId.get(r.authorId)!;
      return {
        id: r.id,
        authorId: r.authorId,
        name: author.name,
        image: author.image,
        body: r.body,
        updatedAt: r.updatedAt,
        isMine: r.authorId === viewerId,
      };
    });

  const joined = new Set(participants.map((p) => p.userId));
  const wrote = new Set(requests.map((r) => r.authorId));
  const people = members
    .map((m) => ({ userId: m.userId, name: m.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const mineRow = requests.find((r) => r.isMine);

  let myRequestIsAssigned = false;
  if (mineRow) {
    const [row] = await db
      .select({ requestId: prayerAssignments.requestId })
      .from(prayerAssignments)
      .where(eq(prayerAssignments.requestId, mineRow.id));
    myRequestIsAssigned = Boolean(row);
  }

  return {
    meetingId,
    status: session?.status ?? "open",
    requests,
    writing: people.filter((p) => joined.has(p.userId) && !wrote.has(p.userId)),
    notJoined: people.filter((p) => !joined.has(p.userId) && !wrote.has(p.userId)),
    viewerJoined: joined.has(viewerId) || wrote.has(viewerId),
    mine: mineRow ? { body: mineRow.body } : null,
    assigned: assignedRow ?? null,
    myRequestIsAssigned,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/integration/prayers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prayers.ts tests/integration/prayers.test.ts
git commit -m "Add the prayer wall read model"
```

---

### Task 3: Assign push notification

**Files:**
- Modify: `src/lib/notifications.ts`
- Test: `src/lib/notifications.test.ts`, `tests/integration/notifications.test.ts`

**Interfaces:**
- Produces: `prayersAssignedCopy(i: { groupId: string; groupName: string; authorName: string; meetingId: string }): PushPayload` and `notifyPrayersAssigned(i: { actorId: string; meetingId: string }): Promise<void>`.

- [ ] **Step 1: Failing copy test**

Add `prayersAssignedCopy` to the import in `src/lib/notifications.test.ts` and:

```ts
  it("prayers assigned", () => {
    expect(
      prayersAssignedCopy({ groupId: "g1", groupName: "Tuesday Group", authorName: "Dan", meetingId: "m1" }),
    ).toEqual({
      title: "Tuesday Group",
      body: "Prayers are assigned. You're praying for Dan's request this week.",
      url: "/open?group=g1&next=%2Fmeetings%2Fm1%2Fprayers",
      tag: "prayers-m1",
    });
  });
```

- [ ] **Step 2: Failing recipients test**

In `tests/integration/notifications.test.ts`, import `postPrayerRequest, assignPrayers` from `@/lib/prayers` and `notifyPrayersAssigned`, then add (reusing that file's `mkUser`/`addMember`; mirror the shape of its existing `notifyMealSet` test, which calls the notify function directly and inspects `push.sendToUsers.mock.calls`):

```ts
  it("prayers assigned: each assignee except the actor, with their own author's name", async () => {
    const a = await mkUser(`u_n_pa_${crypto.randomUUID()}`, "Ann");
    const b = await mkUser(`u_n_pb_${crypto.randomUUID()}`, "Ben");
    const c = await mkUser(`u_n_pc_${crypto.randomUUID()}`, "Cat");
    const { groupId } = await createGroup(a, "Assign group");
    await addMember(a, groupId, b);
    await addMember(a, groupId, c);
    const { meetingId } = await createMeeting(a, groupId, { title: "W", date: "2026-11-26" });
    await postPrayerRequest(a, meetingId, { body: "x" });
    await postPrayerRequest(b, meetingId, { body: "y" });
    await postPrayerRequest(c, meetingId, { body: "z" });
    await assignPrayers(a, meetingId);
    push.sendToUsers.mockClear();

    await notifyPrayersAssigned({ actorId: a, meetingId });

    const calls = push.sendToUsers.mock.calls as [string[], { body: string; url: string }][];
    const recipients = calls.flatMap(([users]) => users).sort();
    expect(recipients).toEqual([b, c].sort());
    for (const [, payload] of calls) {
      expect(payload.url).toContain(encodeURIComponent(`/meetings/${meetingId}/prayers`));
      expect(payload.body).not.toMatch(/[xyz]$/);
    }
  });
```

Run: `pnpm vitest run src/lib/notifications.test.ts tests/integration/notifications.test.ts`
Expected: FAIL, functions not exported.

- [ ] **Step 3: Implement**

In `src/lib/notifications.ts` import `prayerAssignments, prayerRequests` from `@/db/schema`, then:

```ts
export function prayersAssignedCopy(i: {
  groupId: string;
  groupName: string;
  authorName: string;
  meetingId: string;
}): PushPayload {
  return {
    title: i.groupName,
    body: `Prayers are assigned. You're praying for ${i.authorName}'s request this week.`,
    url: inGroup(i.groupId, `/meetings/${i.meetingId}/prayers`),
    tag: `prayers-${i.meetingId}`,
  };
}

// One push per assignee, since each names a different author. The request
// text never goes in a push: lock screens are not the wall.
export async function notifyPrayersAssigned(i: { actorId: string; meetingId: string }): Promise<void> {
  const [meeting] = await db
    .select({ groupId: meetings.groupId })
    .from(meetings)
    .where(eq(meetings.id, i.meetingId));
  if (!meeting) return;
  const rows = await db
    .select({ assigneeId: prayerAssignments.assigneeId, authorName: user.name })
    .from(prayerAssignments)
    .innerJoin(prayerRequests, eq(prayerRequests.id, prayerAssignments.requestId))
    .innerJoin(user, eq(user.id, prayerRequests.authorId))
    .where(and(eq(prayerAssignments.meetingId, i.meetingId), ne(prayerAssignments.assigneeId, i.actorId)));
  const name = await groupName(meeting.groupId);
  for (const row of rows) {
    await deliver("prayers-assigned", async () => ({
      recipients: [row.assigneeId],
      payload: prayersAssignedCopy({
        groupId: meeting.groupId,
        groupName: name,
        authorName: row.authorName,
        meetingId: i.meetingId,
      }),
    }));
  }
}
```

If `PushPayload` has no `tag` field, check `src/lib/push.ts`: `mealSetCopy` already sets `tag`, so it exists.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/lib/notifications.test.ts tests/integration/notifications.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications.ts src/lib/notifications.test.ts tests/integration/notifications.test.ts
git commit -m "Push each member who was assigned a prayer"
```

---

### Task 4: Actions revalidate the wall and schedule the push; journey parent

**Files:**
- Modify: `src/app/(app)/prayers/actions.ts`
- Modify: `src/lib/journey.ts`
- Test: `src/lib/journey.test.ts`

**Interfaces:**
- Consumes: Task 1 actions, Task 3 `notifyPrayersAssigned`.
- Produces: `revalidateWall(meetingId: string): void` (module-private).

- [ ] **Step 1: Failing journey test**

In `src/lib/journey.test.ts` add:

```ts
  it("the prayer wall goes back to its meeting after a cold launch", () => {
    expect(backTarget(walk("/meetings/m1/prayers"))).toEqual({ href: "/meetings/m1", label: "Meeting" });
  });
```

Run: `pnpm vitest run src/lib/journey.test.ts`
Expected: FAIL (href is `/`).

- [ ] **Step 2: Implement journey parent**

In `parentOf` in `src/lib/journey.ts`, before the final return:

```ts
  if (/^\/meetings\/[^/]+\/prayers$/.test(path)) return path.slice(0, -"/prayers".length);
```

Run: `pnpm vitest run src/lib/journey.test.ts` → PASS.

- [ ] **Step 3: Actions revalidate and notify**

In `src/app/(app)/prayers/actions.ts`, add `import { after } from "next/server";` and `import { notifyPrayersAssigned } from "@/lib/notifications";`, then:

```ts
// The wall, its meeting card, and the home chip all read the same rows.
function revalidateWall(meetingId: string) {
  revalidatePath(`/meetings/${meetingId}/prayers`);
  revalidatePath(`/meetings/${meetingId}`);
  revalidatePath("/");
}
```

Replace every `revalidatePath(\`/meetings/${meetingId}\`)` in the file (including inside `refused`) with `revalidateWall(meetingId)`. In `assignPrayersAction`:

```ts
  let result: { assigned: boolean };
  try {
    result = await assignPrayers(user.id, meetingId);
  } catch (err) {
    return refused(err, meetingId);
  }
  // Only the tap that actually assigned tells people; a second tap is a no-op.
  if (result.assigned) after(() => notifyPrayersAssigned({ actorId: user.id, meetingId }));
  revalidateWall(meetingId);
  revalidatePath("/prayers");
  return { error: null, success: true };
```

- [ ] **Step 4: Typecheck, lint, test**

Run: `mise run typecheck && mise run lint && mise run test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/prayers/actions.ts" src/lib/journey.ts src/lib/journey.test.ts
git commit -m "Revalidate the wall, notify on assign, and send Back to the meeting"
```

---

### Task 5: Relative time helper

**Files:**
- Create: `src/lib/time-ago.ts`, `src/lib/time-ago.test.ts`

**Interfaces:**
- Produces: `timeAgo(then: Date, now: Date): string`.

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import { timeAgo } from "@/lib/time-ago";

const now = new Date("2026-11-26T20:00:00Z");
const ago = (ms: number) => timeAgo(new Date(now.getTime() - ms), now);

describe("timeAgo", () => {
  it("reads naturally", () => {
    expect(ago(20_000)).toBe("Just now");
    expect(ago(60_000)).toBe("1 min ago");
    expect(ago(12 * 60_000)).toBe("12 min ago");
    expect(ago(60 * 60_000)).toBe("1 hr ago");
    expect(ago(5 * 60 * 60_000)).toBe("5 hr ago");
    expect(ago(26 * 60 * 60_000)).toBe("1 day ago");
    expect(ago(3 * 24 * 60 * 60_000)).toBe("3 days ago");
  });
  it("never shows the future", () => {
    expect(ago(-5_000)).toBe("Just now");
  });
});
```

Run: `pnpm vitest run src/lib/time-ago.test.ts` → FAIL (module missing).

- [ ] **Step 2: Implement**

```ts
// "2 min ago" for wall posts. Pure and browser-safe (no zod, no db).
export function timeAgo(then: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
```

Run → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/time-ago.ts src/lib/time-ago.test.ts
git commit -m "Add timeAgo for wall posts"
```

---

### Task 6: The wall page

**Files:**
- Create: `src/app/(app)/meetings/[id]/prayers/page.tsx`
- Create: `src/components/prayer-wall.tsx`, `src/components/prayer-wall-feed.tsx`, `src/components/assign-prayers-button.tsx`, `src/components/you-are-praying-for.tsx`
- Modify: `src/components/prayer-buckets.tsx`

**Interfaces:**
- Consumes: `getPrayerWall`, `PrayerWall`, `WallRequest`, `WallPerson` (Task 2); actions (Task 1/4); `timeAgo` (Task 5); `RefreshWhileOpen({ meetingDate, serverToday })`; `Avatar({ name, image, className? })`.
- Produces: `PrayerWallFeed({ requests, now, assigned }: { requests: WallRequest[]; now: Date; assigned: boolean; myRequestIsAssigned: boolean })`, `YouArePrayingFor({ assigned }: { assigned: PrayerWall["assigned"] })` (reused in Task 7).

Screens to match: canvas artboards 1 (not in, with Writing / Not joined rows), 2 (posted), 3 (confirm sheet), 4 (assigned). Hearth classes: card `bg-card rounded-card shadow-card`, feed row `bg-surface-subtle border-divider rounded-[14px] border p-3.5`, body `text-prayer font-serif text-base leading-[1.55] whitespace-pre-line break-words`.

- [ ] **Step 1: Page**

```tsx
// src/app/(app)/meetings/[id]/prayers/page.tsx
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { getMeeting } from "@/lib/meetings";
import { getPrayerWall } from "@/lib/prayers";
import { formatMeetingDate } from "@/lib/utils";
import { PrayerWall } from "@/components/prayer-wall";
import { PrayerWallFeed } from "@/components/prayer-wall-feed";
import { YouArePrayingFor } from "@/components/you-are-praying-for";
import { RefreshOnFocus } from "@/components/refresh-on-focus";
import { RefreshWhileOpen } from "@/components/refresh-while-open";

export default async function PrayerWallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/meetings/${id}/prayers`);
  const meeting = await getMeeting(id);
  if (!meeting) notFound();
  // getPrayerWall checks membership itself and throws "forbidden".
  const wall = await getPrayerWall(user.id, meeting.id);
  const assigned = wall.status === "drawn";
  const now = new Date();

  return (
    <main className="flex flex-col gap-4 p-6">
      <RefreshOnFocus />
      {!assigned && (
        <RefreshWhileOpen meetingDate={meeting.date} serverToday={now.toISOString().slice(0, 10)} />
      )}
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-2xl font-semibold">Prayer wall</h1>
        <p className="text-muted-foreground text-sm break-words">
          {`${meeting.title} · ${formatMeetingDate(meeting.date, { weekday: "long", month: "short", day: "numeric" })}`}
        </p>
      </div>
      <section className="bg-card rounded-card shadow-card flex flex-col gap-4 p-[18px]">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-serif text-[19px] font-semibold">
            {assigned ? "This week" : "This week's requests"}
          </h2>
          <span
            className={
              assigned
                ? "bg-success-tint text-success shrink-0 rounded-full px-2.5 py-1 text-xs"
                : "bg-surface-tint text-muted-foreground shrink-0 rounded-full px-2.5 py-1 text-xs"
            }
          >
            {assigned
              ? `Assigned · ${formatMeetingDate(meeting.date, { month: "short", day: "numeric" })}`
              : `${wall.requests.length} ${wall.requests.length === 1 ? "request" : "requests"}`}
          </span>
        </div>
        {assigned ? (
          <>
            <YouArePrayingFor assigned={wall.assigned} />
            <div className="bg-divider h-px" />
            <p className="text-muted-foreground tracking-label text-xs font-semibold uppercase">
              Everyone&apos;s requests
            </p>
            <PrayerWallFeed requests={wall.requests} now={now} assigned myRequestIsAssigned={wall.myRequestIsAssigned} />
          </>
        ) : (
          <PrayerWall wall={wall} meetingId={meeting.id} currentUserId={user.id}>
            <PrayerWallFeed requests={wall.requests} now={now} assigned={false} myRequestIsAssigned={false} />
          </PrayerWall>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Feed**

```tsx
// src/components/prayer-wall-feed.tsx
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/time-ago";
import type { WallRequest } from "@/lib/prayers";
import { Avatar } from "@/components/avatar";

export function PrayerWallFeed({
  requests,
  now,
  assigned,
  myRequestIsAssigned,
}: {
  requests: WallRequest[];
  now: Date;
  assigned: boolean;
  myRequestIsAssigned: boolean;
}) {
  if (requests.length === 0) {
    return (
      <p className="text-muted-foreground text-center text-[14.5px]">
        No requests yet. Be the first to share one.
      </p>
    );
  }
  // The viewer's own request leads, then everyone else newest first.
  const ordered = [...requests.filter((r) => r.isMine), ...requests.filter((r) => !r.isMine)];
  return (
    <ul className="flex flex-col gap-2.5" aria-label="Prayer requests">
      {ordered.map((request) => (
        <li
          key={request.id}
          data-testid="wall-request"
          className={cn(
            "flex flex-col gap-2 rounded-[14px] border p-3.5",
            request.isMine ? "bg-surface-tint border-warning-border" : "bg-surface-subtle border-divider",
          )}
        >
          <div className="flex items-center gap-2.5">
            <Avatar name={request.name} image={request.image} />
            <div className="flex min-w-0 flex-col">
              <span className="text-[14.5px] font-semibold break-words">
                {request.isMine ? "You" : request.name}
              </span>
              {!assigned && (
                <span className="text-muted-foreground text-xs">{timeAgo(request.updatedAt, now)}</span>
              )}
            </div>
          </div>
          <p className="text-prayer font-serif text-base leading-[1.55] break-words whitespace-pre-line">
            {request.body}
          </p>
          {assigned && request.isMine && myRequestIsAssigned && (
            <p className="text-success text-[12.5px] font-semibold">
              Someone in the group is praying for this
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: You are praying for**

```tsx
// src/components/you-are-praying-for.tsx
import { Avatar } from "@/components/avatar";
import type { PrayerWall } from "@/lib/prayers";

export function YouArePrayingFor({ assigned }: { assigned: PrayerWall["assigned"] }) {
  if (!assigned) {
    return (
      <p className="text-muted-foreground text-center text-[14.5px]">
        Prayers were assigned. You didn&apos;t post this time.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-center text-[12.5px] font-bold tracking-[0.1em] uppercase">
        You&apos;re praying for
      </p>
      <blockquote className="text-prayer px-1.5 text-center font-serif text-[20px] leading-[1.6] break-words whitespace-pre-line">
        &quot;{assigned.body}&quot;
      </blockquote>
      <div className="flex items-center justify-center gap-2">
        <Avatar name={assigned.authorName} image={assigned.authorImage} />
        <span className="text-strong text-[14.5px]">From {assigned.authorName}</span>
      </div>
      <p className="text-muted-foreground text-center text-[13px]">Carry this with you through the week.</p>
    </div>
  );
}
```

- [ ] **Step 4: Buckets restyled**

Rewrite `src/components/prayer-buckets.tsx` with props `{ writing: WallPerson[]; notJoined: WallPerson[]; currentUserId: string }` (import `WallPerson` from `@/lib/prayers`), keeping `namesFor` and the row markup, with rows:

```ts
  const rows = [
    { glyph: "…", glyphClass: "text-primary font-bold", label: "Writing", members: writing, namesClass: "" },
    { glyph: "○", glyphClass: "text-slot-dashed", label: "Not joined", members: notJoined, namesClass: "text-tertiary" },
  ].filter((row) => row.members.length > 0);
```

- [ ] **Step 5: Assign button**

```tsx
// src/components/assign-prayers-button.tsx
"use client";

import { startTransition, useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { assignPrayersAction, type ActionState } from "@/app/(app)/prayers/actions";

const initialState: ActionState = { error: null, success: false };

function list(names: string[]) {
  return names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

export function AssignPrayersButton({
  meetingId,
  requestCount,
  writingNames,
  notJoinedNames,
}: {
  meetingId: string;
  requestCount: number;
  writingNames: string[];
  notJoinedNames: string[];
}) {
  const [open, setOpen] = useState(false);
  const [state, assign, pending] = useActionState(assignPrayersAction.bind(null, meetingId), initialState);

  // The server refuses both regardless; this just doesn't offer the button.
  if (requestCount < 2) {
    return <p className="text-muted-foreground text-center text-[12.5px]">Prayers can be assigned once two requests are in.</p>;
  }
  if (writingNames.length > 0) {
    return (
      <p className="text-muted-foreground text-center text-[12.5px]">
        {`Waiting on ${list(writingNames)} to post. Prayers can be assigned once everyone who's in has posted.`}
      </p>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button size="block" />}>Assign prayers</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign prayers?</DialogTitle>
            <DialogDescription>
              {`${requestCount} requests are on the wall. Everyone who posted gets one to pray for this week, never their own.`}
            </DialogDescription>
          </DialogHeader>
          {notJoinedNames.length > 0 && (
            <p className="bg-surface-tint text-strong rounded-chip px-3.5 py-3 text-[13.5px] leading-normal">
              {`${list(notJoinedNames)} ${notJoinedNames.length === 1 ? "hasn't" : "haven't"} joined. They can still see the wall, but won't get a prayer this week.`}
            </p>
          )}
          <p className="text-muted-foreground text-[13.5px]">
            The wall locks once prayers are assigned. Nothing can be edited afterwards.
          </p>
          {state.error && <p className="text-destructive text-xs">{state.error}</p>}
          <DialogFooter className="flex-col sm:flex-row">
            <DialogClose render={<Button variant="outline" type="button" autoFocus />}>Cancel</DialogClose>
            <Button type="button" disabled={pending} onClick={() => startTransition(() => assign(new FormData()))}>
              {pending ? "Assigning…" : "Assign prayers"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p className="text-muted-foreground -mt-1.5 text-center text-[12.5px]">
        {`${requestCount} people posted · you'll each get one to pray for`}
      </p>
    </>
  );
}
```

`writingNames` / `notJoinedNames` are display names with the viewer replaced by "You" (done by the caller in Step 6).

- [ ] **Step 6: Client wall (stages)**

`src/components/prayer-wall.tsx` is `open-prayer-bowl.tsx` rewritten for the wall. Keep its `useActionState` / `useOptimistic` / edit-mode handling exactly as it is today (copy the file, then change):
- Props: `{ wall: PrayerWall; meetingId: string; currentUserId: string; children: React.ReactNode }` (children = the server-rendered feed).
- `stageOf(wall)`: `wall.mine ? "posted" : wall.viewerJoined ? "writing" : "not-in"`.
- Actions: `joinPrayerWallAction`, `postPrayerRequestAction`, `deletePrayerRequestAction`, `leavePrayerWallAction`.
- Render order: (a) the stage block, (b) `<div className="bg-divider h-px" />`, (c) `children`, (d) `<PrayerBuckets>` with `writing` / `notJoined` after moving the viewer into the bucket matching the optimistic stage (adapt `placeViewer`: "writing" → writing, "not-in" → notJoined, "posted" → neither), (e) `<AssignPrayersButton requestCount={wall.requests.length} writingNames=… notJoinedNames=… />` where names map the viewer to "You" first.
- Stage block:
  - `not-in`: `<Button size="block">I'm in</Button>` and below it `<p className="text-muted-foreground text-center text-[12.5px]">Tap when you're ready to write one, so the group waits for you.</p>`.
  - `writing` or editing: the form from `prayer-compose.tsx` with label `Share a request` (visible `<label htmlFor>` replacing `aria-label`, keep `name="body"`, `required`, `maxLength={1000}`), placeholder "What can we pray for?", hint `Your name shows with it. Everyone in the group can see the wall.`, submit `Post to the wall` (editing: `Save`), then outline `I'm out` (editing: destructive `Delete my request`).
  - `posted`: `<Button variant="secondary" size="pill" className="self-start">Edit my request</Button>` (the request itself shows first in the feed).
- Fold `prayer-compose.tsx` into this file as a local `PostForm` component.

- [ ] **Step 7: Verify in the browser**

Run: `mise run typecheck && mise run lint && mise run test`, then start the dev server with preview_start, sign in two seeded members, open `/meetings/<id>/prayers`, and check against artboards 1–4: I'm in → form; post → own request first and tinted; second member posts → appears within 5 s; Assign prayers confirm → assigned view with "You're praying for" and "Someone in the group is praying for this" on your own. Take a screenshot of each state.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/meetings/[id]/prayers" src/components/prayer-wall.tsx src/components/prayer-wall-feed.tsx src/components/assign-prayers-button.tsx src/components/you-are-praying-for.tsx src/components/prayer-buckets.tsx
git commit -m "Add the prayer wall page"
```

---

### Task 7: Meeting preview card, home chip, and removal of the bowl UI

**Files:**
- Create: `src/components/prayer-preview-card.tsx`
- Modify: `src/app/(app)/meetings/[id]/page.tsx`, `src/lib/meetings.ts`, `src/components/meeting-row.tsx`
- Delete: `src/components/prayer-section.tsx`, `open-prayer-bowl.tsx`, `prayer-compose.tsx`, `draw-bowl-button.tsx`, `drawn-prayer-bowl.tsx`; `getPrayerBowl`, `PrayerBowl`, `BowlMember` in `src/lib/prayers.ts` (and their tests' uses: switch remaining `getPrayerBowl` assertions in `tests/integration/prayers.test.ts` to `getPrayerWall` equivalents: `submitted` → `requests` authors, `waiting` → `writing`, `drawn` → `assigned`)
- Test: `tests/integration/meetings.test.ts` (or the file that covers `listMeetings`; find with `grep -rln listMeetings tests`)

**Interfaces:**
- Consumes: `getPrayerWall`, `YouArePrayingFor` (Task 6).
- Produces: `Meeting` gains `prayerRequestCount: number` (returned by `listMeetings` only; `getMeeting` returns `0`).

- [ ] **Step 1: Failing count test**

```ts
  it("listMeetings counts each meeting's prayer requests from current members", async () => {
    // seed: group with alice + bob, meeting m; bob posts; then:
    await postPrayerRequest(bob, meetingId, { body: "x" });
    const [m] = (await listMeetings(groupId)).filter((x) => x.id === meetingId);
    expect(m.prayerRequestCount).toBe(1);
    await removeMember(alice, groupId, bob);
    const [after] = (await listMeetings(groupId)).filter((x) => x.id === meetingId);
    expect(after.prayerRequestCount).toBe(0);
  });
```

Use the seeding helpers already in that test file (`mkUser`, `addMember`, `createGroup`, `createMeeting`). Run → FAIL.

- [ ] **Step 2: Implement the count**

In `src/lib/meetings.ts`, add `prayerRequestCount: number` to `Meeting`; in `listMeetings`:

```ts
      prayerRequestCount: sql<number>`(
        select count(*)::int from ${prayerRequests}
        join ${member} on ${member.userId} = ${prayerRequests.authorId}
          and ${member.organizationId} = ${meetings.groupId}
        where ${prayerRequests.meetingId} = ${meetings.id}
      )`,
```

and in every other function that builds a `Meeting`, add `prayerRequestCount: sql<number>\`0\``, or narrow their return type to `Omit<Meeting, "prayerRequestCount">` if that is less churn (pick one and apply consistently; typecheck will list every site). Run test → PASS.

- [ ] **Step 3: Home chip**

In `src/components/meeting-row.tsx`, below the date span:

```tsx
      {meeting.prayerRequestCount > 0 && (
        <span className="bg-accent-tint text-button-secondary-foreground self-start rounded-full px-2.5 py-1 text-xs font-semibold">
          {`Prayer wall · ${meeting.prayerRequestCount} ${meeting.prayerRequestCount === 1 ? "request" : "requests"}`}
        </span>
      )}
```

Change the link's `gap-1` to `gap-1.5`.

- [ ] **Step 4: Preview card**

```tsx
// src/components/prayer-preview-card.tsx
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Avatar } from "@/components/avatar";
import { YouArePrayingFor } from "@/components/you-are-praying-for";
import { getPrayerWall } from "@/lib/prayers";
import { cn, formatMeetingDate } from "@/lib/utils";

export async function PrayerPreviewCard({
  meetingId,
  meetingDate,
  currentUserId,
}: {
  meetingId: string;
  meetingDate: string;
  currentUserId: string;
}) {
  const wall = await getPrayerWall(currentUserId, meetingId);
  const assigned = wall.status === "drawn";
  const href = `/meetings/${meetingId}/prayers`;
  const newest = wall.requests.slice(0, 2);
  const more = wall.requests.length - newest.length;

  return (
    <section className="bg-card rounded-card shadow-card flex flex-col gap-3 p-[18px]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-[19px] font-semibold">Prayer wall</h2>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs",
            assigned ? "bg-success-tint text-success" : "bg-surface-tint text-muted-foreground",
          )}
        >
          {assigned
            ? `Assigned · ${formatMeetingDate(meetingDate, { month: "short", day: "numeric" })}`
            : `${wall.requests.length} ${wall.requests.length === 1 ? "request" : "requests"}`}
        </span>
      </div>
      {assigned ? (
        <>
          <YouArePrayingFor assigned={wall.assigned} />
          <Link href={href} className={cn(buttonVariants({ variant: "secondary", size: "pill" }), "self-start")}>
            See the whole wall ›
          </Link>
        </>
      ) : (
        <>
          {newest.length === 0 ? (
            <p className="text-muted-foreground text-[14.5px]">No requests yet. Be the first to share one.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {newest.map((r) => (
                <li key={r.id} className="flex items-start gap-2.5">
                  <Avatar name={r.name} image={r.image} />
                  <p className="text-prayer line-clamp-2 font-serif text-[15px] leading-normal break-words">{r.body}</p>
                </li>
              ))}
            </ul>
          )}
          {(more > 0 || !wall.mine) && newest.length > 0 && (
            <p className="text-muted-foreground text-[13px]">
              {[more > 0 ? `+ ${more} more` : null, wall.mine ? null : "You haven't posted yet"]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          <Link href={href} className={buttonVariants({ size: "block" })}>
            Open the prayer wall
          </Link>
        </>
      )}
    </section>
  );
}
```


- [ ] **Step 5: Swap the meeting page and delete the bowl UI**

In `src/app/(app)/meetings/[id]/page.tsx` replace the `PrayerSection` import and element with `PrayerPreviewCard` (same props). Delete the five bowl components and `getPrayerBowl` / `PrayerBowl` / `BowlMember`. Update `RefreshWhileOpen`'s header comment: "While the wall is open, every screen showing it…". Fix the remaining integration tests as listed under Files.

- [ ] **Step 6: Verify**

Run: `mise run typecheck && mise run lint && mise run test`. In the browser: home shows the chip (artboard A); meeting page card (B) links to the wall; after assigning the card matches C. Screenshot each.

- [ ] **Step 7: Commit**

```bash
git add -A src tests
git commit -m "Link to the prayer wall from home and the meeting page"
```

---

### Task 8: My prayers copy and What's new

**Files:**
- Modify: `src/app/(app)/prayers/page.tsx`, `src/lib/whats-new.ts`

- [ ] **Step 1: Copy**

In `src/app/(app)/prayers/page.tsx`: subtitle `Requests you&apos;ve been assigned, week by week`; empty state body `When your group assigns prayers, the one you get lands here.` and title `Nothing assigned yet`.

- [ ] **Step 2: What's new**

At the top of `releases` in `src/lib/whats-new.ts`:

```ts
  {
    id: 7,
    date: "2026-11-22",
    title: "The prayer bowl is now a prayer wall",
    body: "Everyone in your group can now see prayer requests as they come in, with names, including past weeks. When you're done sharing, tap Assign prayers and each of you gets one to pray for.",
  },
```

Change the date to the ship date when the PR is opened.

- [ ] **Step 3: Test and commit**

Run: `mise run test` (the What's new tests check ids are unique and descending).

```bash
git add "src/app/(app)/prayers/page.tsx" src/lib/whats-new.ts
git commit -m "Say what changed in My prayers and What's new"
```

---

### Task 9: End-to-end

**Files:**
- Modify: `e2e/prayers.spec.ts`, `e2e/display-name.spec.ts`, `e2e/meals.spec.ts`

- [ ] **Step 1: Rewrite the prayers flow**

Keep the setup in `e2e/prayers.spec.ts` (Alice creates the group, Bob and Carol join, Alice plans a meeting today). Replace everything from "Alice signs hers" with:

```ts
  // Home shows nothing yet; the meeting card links to the wall.
  await alice.getByRole("link", { name: "Open the prayer wall" }).click();
  await expectApp(alice.getByRole("heading", { name: "Prayer wall" })).toBeVisible();
  const wallPath = new URL(alice.url()).pathname;

  await alice.getByRole("button", { name: "I'm in" }).click();
  await alice.getByLabel("Share a request").fill(aliceRequest);
  await alice.getByRole("button", { name: "Post to the wall" }).click();
  await expectApp(alice.getByTestId("wall-request").filter({ hasText: aliceRequest })).toBeVisible();

  // Bob posts directly; both requests show for both.
  await bob.goto(wallPath);
  await bob.getByRole("button", { name: "I'm in" }).click();
  await bob.getByLabel("Share a request").fill(bobRequest);
  await bob.getByRole("button", { name: "Post to the wall" }).click();
  await expectApp(bob.getByTestId("wall-request").filter({ hasText: aliceRequest })).toBeVisible();
  await expectApp(alice.getByTestId("wall-request").filter({ hasText: bobRequest })).toBeVisible();

  // Carol taps I'm in and holds assigning up until she leaves.
  await carol.goto(wallPath);
  await carol.getByRole("button", { name: "I'm in" }).click();
  await expectApp(alice.getByText(/Waiting on Carol to post/)).toBeVisible();
  await carol.getByRole("button", { name: "I'm out" }).click();

  await alice.getByRole("button", { name: "Assign prayers" }).click();
  await alice.getByRole("dialog").getByRole("button", { name: "Assign prayers" }).click();
  await expectApp(alice.getByText("You're praying for")).toBeVisible();
  await expectApp(alice.getByText(`"${bobRequest}"`)).toBeVisible();
  await bob.reload();
  await expectApp(bob.getByText(`"${aliceRequest}"`)).toBeVisible();
  await expectApp(bob.getByText("Someone in the group is praying for this")).toBeVisible();

  // Home chip and My prayers.
  await alice.getByRole("link", { name: "Meetings", exact: true }).click();
  await expectApp(alice.getByText("Prayer wall · 2 requests")).toBeVisible();
  await alice.getByRole("link", { name: "My prayers" }).click();
  await expectApp(alice.getByText(`From Bob`)).toBeVisible();
```

Rename the test to "members post to the wall, I'm in holds assigning, and each poster gets the other's request".

- [ ] **Step 2: Update the other specs**

- `display-name.spec.ts`: where it checks the bowl buckets on the meeting page, open the wall (`Open the prayer wall`), tap I'm in, and assert the new name in the "Writing" row on the other member's wall.
- `meals.spec.ts`: update the comment about the bowl listing "You" (the meeting page no longer has buckets); keep the scoping.

- [ ] **Step 3: Run**

Run: `PORT=3300 mise run e2e` (see memory note: port 3000 can reuse another worktree's server).
Expected: PASS. If a step times out under load, rerun once before debugging.

- [ ] **Step 4: Commit**

```bash
git add e2e
git commit -m "Cover the prayer wall end to end"
```

---

## Before the PR

- `mise run lint && mise run typecheck && mise run test && PORT=3300 mise run e2e && mise run build`
- Production migration `0010` drops `include_name`; it is irreversible. Vercel runs migrations on deploy as for earlier plans (check `package.json` build script); confirm before merging.
- Stop at PR-ready: the user merges.
