# Push Notifications and Settings Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members who install the app and flip one toggle get a push notification when a meeting is created, a meal is set, a recipe is added, someone asks to join (admins), or their own join request is approved.

**Architecture:** Web Push sent straight from the server action inside Next's `after()`, with `web-push` as the transport and a `push_subscriptions` table keyed by endpoint. A transport module (`src/lib/push.ts`) knows nothing about the domain; a domain module (`src/lib/notifications.ts`) has one function per event that resolves recipients and copy from ids. The personal controls on the Group screen move to a new `/settings` page reached by a gear icon, and the new Notifications card joins them there.

**Tech Stack:** Next 16 (App Router, server actions, `after()`), Serwist service worker, Drizzle + Postgres, zod v4, `web-push`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-push-notifications-design.md`

## Global Constraints

- All DB access through `src/db/client.ts`; schema in `src/db/schema.ts`; migrations generated with `pnpm drizzle-kit generate` into `drizzle/`.
- Server env read from `env` (`src/lib/env.ts`), never `process.env`, except `NEXT_PUBLIC_*` in browser-imported modules.
- zod stays out of `"use client"` components. Server actions parse input with `schema.safeParse(...)` and return `issues[0].message` as user-facing copy.
- Nothing sent to Sentry may contain a body, a name, an email, or an endpoint: ids, codes, and counts only.
- Server action files call `logRefusal(err)` first thing in their refusal mapping.
- No em dashes in UI strings or action errors.
- Every tappable element uses `Button`/`buttonVariants` or has a reasoned `ALLOWED` entry in `src/components/button-styling.test.ts`.
- Local Postgres must be up before integration tests (`mise run db:up`). Port 5432 may be held by another project; if so change `DATABASE_URL` in `.env` to a free port and the port mapping in `docker-compose.yml` locally, without committing either.
- Run `pnpm` binaries via `pnpm <bin>` or `node_modules/.bin/<bin>`.
- Commit messages: no Claude co-author trailer other than the one the session reminder mandates. The user merges PRs; stop at PR-ready.

---

## File structure

| File | Responsibility |
|---|---|
| `src/db/schema.ts` | adds `pushSubscriptions` table |
| `drizzle/0008_*.sql` + meta | generated migration |
| `src/lib/env.ts` | adds `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (optional) |
| `.env.example` | documents the three VAPID names |
| `src/lib/push.ts` | transport: subscription CRUD, zod input schema, `sendToUsers` |
| `src/lib/notifications.ts` | domain: copy builders and one `notify*` per event |
| `src/lib/notifications-state.ts` | pure `cardState()` for the client card (no zod, no db) |
| `src/lib/monitoring.ts` | `logPushSent`, `logPushRejected`, `reportPushFailure` |
| `src/lib/groups.ts` | `requestToJoin` returns `created`; `approveRequest` returns ids |
| `src/app/sw.ts` | `push` and `notificationclick` listeners |
| `src/app/(app)/settings/actions.ts` | `subscribeAction`, `unsubscribeAction` |
| `src/app/(app)/settings/page.tsx` | Settings page |
| `src/components/notifications-card.tsx` | client card with the toggle |
| `src/components/settings-link.tsx` | gear icon link used in the Group header |
| `src/app/(app)/group/page.tsx` | loses personal cards, gains gear |
| `src/components/tab-bar.tsx` | `/settings` highlights Group |
| `src/components/button-styling.test.ts` | `ALLOWED` entry for the switch |
| `src/app/(app)/{meetings,meals,recipes,join,group}/actions.ts` | schedule notify calls in `after()` |
| `tests/integration/push.test.ts` | transport tests |
| `tests/integration/notifications.test.ts` | recipient resolution tests |
| `tests/integration/groups.test.ts` | updated return-value assertions |
| `src/lib/notifications.test.ts` | copy builder unit tests |
| `src/lib/notifications-state.test.ts` | `cardState` unit tests |
| `src/lib/env.test.ts`, `src/lib/monitoring.test.ts` | new cases |
| `e2e/settings.spec.ts` | new; `e2e/theme.spec.ts`, `e2e/report-problem.spec.ts` updated |
| `CLAUDE.md` | one convention line about push |

---

### Task 1: Dependency, env, schema, migration

**Files:**
- Modify: `package.json` (via pnpm)
- Modify: `src/lib/env.ts`
- Modify: `src/lib/env.test.ts`
- Modify: `src/db/schema.ts`
- Create: `drizzle/0008_*.sql` (generated)
- Modify: `.env.example`

**Interfaces:**
- Produces: `env.VAPID_PRIVATE_KEY?: string`, `env.VAPID_SUBJECT?: string`; table `pushSubscriptions` with columns `id, userId, endpoint, p256dh, auth, userAgent, createdAt`.

- [ ] **Step 1: Install web-push and its types**

```bash
pnpm add web-push && pnpm add -D @types/web-push
```

- [ ] **Step 2: Write the failing env test**

Append to `src/lib/env.test.ts` inside `describe("parseEnv")`:

```ts
  it("accepts the optional VAPID pair and treats blanks as unset", () => {
    const parsed = parseEnv({
      ...required,
      VAPID_PRIVATE_KEY: "private",
      VAPID_SUBJECT: "mailto:owner@example.com",
    });
    expect(parsed.VAPID_PRIVATE_KEY).toBe("private");
    expect(parsed.VAPID_SUBJECT).toBe("mailto:owner@example.com");
    expect(parseEnv({ ...required, NEXT_PUBLIC_VAPID_PUBLIC_KEY: "public" }).NEXT_PUBLIC_VAPID_PUBLIC_KEY).toBe("public");
    expect(parseEnv({ ...required, VAPID_PRIVATE_KEY: "" }).VAPID_PRIVATE_KEY).toBeUndefined();
  });
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run src/lib/env.test.ts`
Expected: FAIL, `parsed.VAPID_PRIVATE_KEY` is undefined (unknown keys are dropped).

- [ ] **Step 4: Add the variables to the schema**

In `src/lib/env.ts`, after `AUTH_EMAIL_FROM`:

```ts
  // Web Push signing keys — see src/lib/push.ts. Unset, pushes are skipped
  // with a console line, which is all local dev, CI, and e2e need. Generate
  // once with `npx web-push generate-vapid-keys`; the public half goes in
  // NEXT_PUBLIC_VAPID_PUBLIC_KEY, which the browser reads directly.
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  // The public half is also read server-side, to sign sends.
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
```

- [ ] **Step 5: Run the env test to verify it passes**

Run: `pnpm vitest run src/lib/env.test.ts`
Expected: PASS

- [ ] **Step 6: Add the table to the schema**

Append to `src/db/schema.ts`:

```ts
// One row per device that turned notifications on (Settings). Subscriptions
// belong to a user, not a group: one toggle covers every group they're in.
// `endpoint` is the push service's URL for the device and is unique, which is
// what makes re-subscribing the same device an upsert. Rows are deleted when
// a send comes back 404 or 410 (the app was removed or its data cleared).
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    // For the owner's debugging only (which device went stale); never shown.
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("push_subscriptions_by_user").on(t.userId)],
);
```

- [ ] **Step 7: Generate the migration**

```bash
pnpm drizzle-kit generate
```

Expected: a new `drizzle/0008_<name>.sql` containing `CREATE TABLE "push_subscriptions"` with the unique constraint on `endpoint`, the index, and the FK with `ON DELETE cascade`; `drizzle/meta/0008_snapshot.json` and an updated `_journal.json`.

- [ ] **Step 8: Apply it locally and run the integration suite**

```bash
mise run db:up && pnpm vitest run tests/integration/db.test.ts
```

Expected: PASS (global setup runs `migrate`, which applies 0008).

- [ ] **Step 9: Document the env names**

Append to `.env.example`:

```
# Web Push (Settings > Notifications). Generate once with `npx web-push generate-vapid-keys`.
# Unset locally: pushes are skipped with a console line. All three go in Vercel for prod.
# VAPID_PRIVATE_KEY=
# VAPID_SUBJECT=mailto:you@example.com
# NEXT_PUBLIC_VAPID_PUBLIC_KEY=
```

- [ ] **Step 10: Typecheck and commit**

```bash
pnpm tsc --noEmit && git add package.json pnpm-lock.yaml src/lib/env.ts src/lib/env.test.ts src/db/schema.ts drizzle .env.example && git commit -m "Add the push_subscriptions table, VAPID env, and web-push"
```

---

### Task 2: Transport module `src/lib/push.ts`

**Files:**
- Create: `src/lib/push.ts`
- Modify: `src/lib/monitoring.ts`, `src/lib/monitoring.test.ts`
- Test: `tests/integration/push.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type PushPayload = { title: string; body: string; url: string };
  export const pushSubscriptionInput: z.ZodType<...>  // { endpoint, keys: { p256dh, auth }, userAgent? }
  export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInput>;
  export async function saveSubscription(userId: string, input: PushSubscriptionInput): Promise<void>
  export async function deleteSubscription(userId: string, endpoint: string): Promise<void>
  export async function sendToUsers(userIds: string[], payload: PushPayload): Promise<{ attempted: number; failed: number }>
  ```
- Produces in monitoring: `logPushSent(event: string, counts: { attempted: number; failed: number })`, `logPushRejected(subscriptionId: string, statusCode: number)`, `reportPushFailure(err: unknown)`.

- [ ] **Step 1: Write the monitoring tests**

Append to `src/lib/monitoring.test.ts` (import the three new names alongside the existing import):

```ts
describe("push records", () => {
  it("logs a batch by event name and counts only", () => {
    logPushSent("meal-set", { attempted: 3, failed: 1 });
    expect(sentry.logger.info).toHaveBeenCalledWith("Push sent", {
      event: "meal-set", attempted: 3, failed: 1,
    });
    runAfterResponse();
    expect(sentry.flush).toHaveBeenCalled();
  });

  it("warns about a rejected subscription by id and status", () => {
    logPushRejected("sub_1", 500);
    expect(sentry.logger.warn).toHaveBeenCalledWith("Push rejected", {
      subscriptionId: "sub_1", statusCode: 500,
    });
  });

  it("captures a push fault tagged by area", () => {
    const err = new Error("boom");
    reportPushFailure(err);
    expect(sentry.captureException).toHaveBeenCalledWith(err, { tags: { area: "push" } });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/lib/monitoring.test.ts`
Expected: FAIL, names not exported.

- [ ] **Step 3: Add the helpers to monitoring.ts**

After `reportEmailFailure` in `src/lib/monitoring.ts`:

```ts
// Push delivery records (src/lib/push.ts, src/lib/notifications.ts). Counts
// and ids only: never a title, body, name, or endpoint.
export function logPushSent(event: string, counts: { attempted: number; failed: number }) {
  Sentry.logger.info("Push sent", { event, ...counts });
  flushAfterResponse();
}

export function logPushRejected(subscriptionId: string, statusCode: number) {
  Sentry.logger.warn("Push rejected", { subscriptionId, statusCode });
  flushAfterResponse();
}

// Keys misconfigured or the push service down: every send failed. An error,
// not a log, so it opens an issue; nobody notices a notification that never came.
export function reportPushFailure(err: unknown) {
  Sentry.captureException(err, { tags: { area: "push" } });
  flushAfterResponse();
}
```

- [ ] **Step 4: Run monitoring tests**

Run: `pnpm vitest run src/lib/monitoring.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing transport tests**

Create `tests/integration/push.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { pushSubscriptions } from "@/db/schema";

// The push service is mocked: these tests exercise our bookkeeping around it.
const webpush = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));
vi.mock("web-push", () => ({ default: webpush }));

// Keys present, so the configured path runs. The rest of env stays real
// (the db client needs DATABASE_URL).
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      VAPID_PRIVATE_KEY: "test-private",
      VAPID_SUBJECT: "mailto:t@example.com",
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "test-public",
    },
  };
});

const monitoring = vi.hoisted(() => ({
  logPushRejected: vi.fn(),
  reportPushFailure: vi.fn(),
}));
vi.mock("@/lib/monitoring", () => monitoring);

import {
  deleteSubscription,
  pushSubscriptionInput,
  saveSubscription,
  sendToUsers,
} from "@/lib/push";

async function mkUser(id: string, name = id) {
  await db.execute(sql`insert into "user" (id, name, email, email_verified, created_at, updated_at)
    values (${id}, ${name}, ${id + "@example.com"}, true, now(), now()) on conflict do nothing`);
  return id;
}

function subscription(endpoint: string) {
  return { endpoint, keys: { p256dh: "p256dh-key", auth: "auth-key" } };
}

function statusError(statusCode: number) {
  return Object.assign(new Error(`push service said ${statusCode}`), { statusCode });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pushSubscriptionInput", () => {
  it("accepts what PushSubscription.toJSON() produces", () => {
    const parsed = pushSubscriptionInput.safeParse({
      endpoint: "https://push.example/abc",
      expirationTime: null,
      keys: { p256dh: "k1", auth: "k2" },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an http endpoint, missing keys, and an oversized user agent", () => {
    expect(pushSubscriptionInput.safeParse(subscription("http://push.example/abc")).success).toBe(false);
    expect(pushSubscriptionInput.safeParse({ endpoint: "https://push.example/abc", keys: { p256dh: "k" } }).success).toBe(false);
    expect(
      pushSubscriptionInput.safeParse({ ...subscription("https://push.example/abc"), userAgent: "x".repeat(600) }).success,
    ).toBe(false);
  });
});

describe("subscriptions", () => {
  it("upserts by endpoint, reassigning a device that changed hands", async () => {
    const alice = await mkUser(`u_p_alice_${crypto.randomUUID()}`);
    const bob = await mkUser(`u_p_bob_${crypto.randomUUID()}`);
    const endpoint = `https://push.example/${crypto.randomUUID()}`;

    await saveSubscription(alice, { ...subscription(endpoint), userAgent: "iPhone" });
    await saveSubscription(alice, subscription(endpoint));
    let rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(alice);

    await saveSubscription(bob, subscription(endpoint));
    rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(bob);
  });

  it("deletes only the owner's row", async () => {
    const alice = await mkUser(`u_p_alice_${crypto.randomUUID()}`);
    const bob = await mkUser(`u_p_bob_${crypto.randomUUID()}`);
    const endpoint = `https://push.example/${crypto.randomUUID()}`;
    await saveSubscription(alice, subscription(endpoint));

    await deleteSubscription(bob, endpoint);
    expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint))).toHaveLength(1);

    await deleteSubscription(alice, endpoint);
    expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint))).toHaveLength(0);
  });
});

describe("sendToUsers", () => {
  const payload = { title: "Tuesday Group", body: "Sameer set the meal", url: "/meetings/m1" };

  it("sends one push per subscription of the named users and reports counts", async () => {
    const alice = await mkUser(`u_p_alice_${crypto.randomUUID()}`);
    const bob = await mkUser(`u_p_bob_${crypto.randomUUID()}`);
    const carol = await mkUser(`u_p_carol_${crypto.randomUUID()}`);
    const a1 = `https://push.example/${crypto.randomUUID()}`;
    const a2 = `https://push.example/${crypto.randomUUID()}`;
    const b1 = `https://push.example/${crypto.randomUUID()}`;
    const c1 = `https://push.example/${crypto.randomUUID()}`;
    await saveSubscription(alice, subscription(a1));
    await saveSubscription(alice, subscription(a2));
    await saveSubscription(bob, subscription(b1));
    await saveSubscription(carol, subscription(c1));
    webpush.sendNotification.mockResolvedValue({ statusCode: 201 });

    const result = await sendToUsers([alice, bob], payload);

    expect(result).toEqual({ attempted: 3, failed: 0 });
    expect(webpush.setVapidDetails).toHaveBeenCalledWith("mailto:t@example.com", "test-public", "test-private");
    const endpoints = webpush.sendNotification.mock.calls.map(([sub]) => sub.endpoint).sort();
    expect(endpoints).toEqual([a1, a2, b1].sort());
    expect(webpush.sendNotification.mock.calls[0][1]).toBe(JSON.stringify(payload));
  });

  it("deletes a subscription the push service says is gone, keeps one that merely failed", async () => {
    const alice = await mkUser(`u_p_alice_${crypto.randomUUID()}`);
    const gone = `https://push.example/${crypto.randomUUID()}`;
    const flaky = `https://push.example/${crypto.randomUUID()}`;
    await saveSubscription(alice, subscription(gone));
    await saveSubscription(alice, subscription(flaky));
    webpush.sendNotification.mockImplementation((sub: { endpoint: string }) =>
      Promise.reject(statusError(sub.endpoint === gone ? 410 : 500)),
    );

    const result = await sendToUsers([alice], payload);

    expect(result).toEqual({ attempted: 2, failed: 1 });
    const remaining = await db
      .select({ endpoint: pushSubscriptions.endpoint })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, alice));
    expect(remaining.map((r) => r.endpoint)).toEqual([flaky]);
    expect(monitoring.logPushRejected).toHaveBeenCalledWith(expect.any(String), 500);
    expect(monitoring.logPushRejected).toHaveBeenCalledTimes(1);
  });

  it("returns zeros for users with no subscriptions without touching the push service", async () => {
    const nobody = await mkUser(`u_p_nobody_${crypto.randomUUID()}`);
    expect(await sendToUsers([nobody], payload)).toEqual({ attempted: 0, failed: 0 });
    expect(await sendToUsers([], payload)).toEqual({ attempted: 0, failed: 0 });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run to verify they fail**

Run: `pnpm vitest run tests/integration/push.test.ts`
Expected: FAIL, cannot resolve `@/lib/push`.

- [ ] **Step 7: Write the transport**

Create `src/lib/push.ts`:

```ts
import { and, eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import { z } from "zod";
import { db } from "@/db/client";
import { pushSubscriptions } from "@/db/schema";
import { env } from "@/lib/env";
import { logPushRejected } from "@/lib/monitoring";

// Web Push transport. Knows about subscriptions and the push service, nothing
// about meetings or groups (that's src/lib/notifications.ts). Payloads are
// encrypted end to end by the protocol, so Apple's and Google's push services
// never read them; what we log is counts and ids only.

export type PushPayload = { title: string; body: string; url: string };

// What PushSubscription.toJSON() produces in the browser, plus the user agent
// the card sends along. `expirationTime` arrives too and is ignored.
export const pushSubscriptionInput = z.object({
  endpoint: z.url({ protocol: /^https$/, error: "That subscription doesn't look right." }),
  keys: z.object({
    p256dh: z.string().min(1, "That subscription doesn't look right."),
    auth: z.string().min(1, "That subscription doesn't look right."),
  }),
  userAgent: z.string().max(512).optional(),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInput>;

// Upsert by endpoint. A device that re-subscribes stays one row; a device on
// which a different member has since signed in is reassigned to them.
export async function saveSubscription(userId: string, input: PushSubscriptionInput): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: input.userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: input.userAgent ?? null,
        createdAt: new Date(),
      },
    });
}

// Scoped to the owner so one member can't remove another's device.
export async function deleteSubscription(userId: string, endpoint: string): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

function configured(): boolean {
  return Boolean(env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT && env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
}

// Configured lazily so importing this module has no side effects and the
// unconfigured path (local dev, CI) never touches web-push.
let vapidReady = false;
function ensureVapid() {
  if (vapidReady) return;
  webpush.setVapidDetails(env.VAPID_SUBJECT!, env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
  vapidReady = true;
}

function statusCodeOf(err: unknown): number | null {
  if (typeof err === "object" && err !== null && "statusCode" in err) {
    const code = (err as { statusCode: unknown }).statusCode;
    return typeof code === "number" ? code : null;
  }
  return null;
}

// Sends `payload` to every device of every listed user, in parallel. A 404 or
// 410 means the device is gone (app deleted, data cleared): its row is
// removed. Anything else is counted as failed and logged by id. Never throws.
export async function sendToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<{ attempted: number; failed: number }> {
  if (userIds.length === 0) return { attempted: 0, failed: 0 };
  const targets = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds));
  if (targets.length === 0) return { attempted: 0, failed: 0 };

  if (!configured()) {
    console.log(`\n[push] ${targets.length} notification(s) skipped: VAPID keys not configured\n`);
    return { attempted: 0, failed: 0 };
  }
  ensureVapid();

  const body = JSON.stringify(payload);
  const results = await Promise.all(
    targets.map(async (target) => {
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          body,
        );
        return "sent" as const;
      } catch (err) {
        const status = statusCodeOf(err);
        if (status === 404 || status === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, target.id));
          return "gone" as const;
        }
        logPushRejected(target.id, status ?? 0);
        return "failed" as const;
      }
    }),
  );
  return {
    attempted: results.length,
    failed: results.filter((r) => r === "failed").length,
  };
}
```

- [ ] **Step 8: Run the transport tests**

Run: `pnpm vitest run tests/integration/push.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 9: Typecheck, lint, commit**

```bash
pnpm tsc --noEmit && pnpm eslint src/lib/push.ts tests/integration/push.test.ts src/lib/monitoring.ts && git add src/lib/push.ts src/lib/monitoring.ts src/lib/monitoring.test.ts tests/integration/push.test.ts && git commit -m "Add the Web Push transport: subscriptions and sendToUsers"
```

---

### Task 3: Domain module `src/lib/notifications.ts`

**Files:**
- Create: `src/lib/notifications.ts`
- Test: `src/lib/notifications.test.ts` (copy, unit), `tests/integration/notifications.test.ts` (recipients)

**Interfaces:**
- Consumes: `sendToUsers`, `PushPayload` from `@/lib/push`; `logPushSent`, `reportPushFailure` from `@/lib/monitoring`; `formatMeetingDate` from `@/lib/utils`.
- Produces:
  ```ts
  export function meetingCreatedCopy(i: { groupName; actorName; date; title; meetingId }): PushPayload
  export function mealSetCopy(i: { groupName; actorName; date; recipeName; meetingId }): PushPayload
  export function recipeAddedCopy(i: { groupName; actorName; recipeName; recipeId }): PushPayload
  export function joinRequestedCopy(i: { groupName; requesterName }): PushPayload
  export function requestApprovedCopy(i: { groupName }): PushPayload
  export async function notifyMeetingCreated(i: { actorId: string; meetingId: string }): Promise<void>
  export async function notifyMealSet(i: { actorId: string; meetingId: string }): Promise<void>
  export async function notifyRecipeAdded(i: { actorId: string; recipeId: string }): Promise<void>
  export async function notifyJoinRequested(i: { groupId: string; requesterId: string }): Promise<void>
  export async function notifyRequestApproved(i: { groupId: string; userId: string }): Promise<void>
  ```

- [ ] **Step 1: Write the copy unit tests**

Create `src/lib/notifications.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  joinRequestedCopy,
  mealSetCopy,
  meetingCreatedCopy,
  recipeAddedCopy,
  requestApprovedCopy,
} from "./notifications";

// The group name is the title because a member can be in several groups.
// Dates are short so the body fits one lock-screen line.
describe("notification copy", () => {
  it("meeting created", () => {
    expect(
      meetingCreatedCopy({
        groupName: "Tuesday Group", actorName: "Sameer", date: "2026-10-14",
        title: "Game night", meetingId: "m1",
      }),
    ).toEqual({
      title: "Tuesday Group",
      body: "Sameer added a meeting: Game night on Tue, Oct 14",
      url: "/meetings/m1",
    });
  });

  it("meal set", () => {
    expect(
      mealSetCopy({
        groupName: "Tuesday Group", actorName: "Sameer", date: "2026-10-14",
        recipeName: "Tacos", meetingId: "m1",
      }),
    ).toEqual({
      title: "Tuesday Group",
      body: "Sameer set the meal for Tue, Oct 14: Tacos",
      url: "/meetings/m1",
    });
  });

  it("recipe added", () => {
    expect(
      recipeAddedCopy({ groupName: "Tuesday Group", actorName: "Sameer", recipeName: "Tacos", recipeId: "r1" }),
    ).toEqual({ title: "Tuesday Group", body: "Sameer added a recipe: Tacos", url: "/recipes/r1" });
  });

  it("join requested", () => {
    expect(joinRequestedCopy({ groupName: "Tuesday Group", requesterName: "Priya" })).toEqual({
      title: "Tuesday Group",
      body: "Priya asked to join",
      url: "/group",
    });
  });

  it("request approved", () => {
    expect(requestApprovedCopy({ groupName: "Tuesday Group" })).toEqual({
      title: "Tuesday Group",
      body: "You're in. Welcome to Tuesday Group.",
      url: "/",
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/notifications.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the recipient integration tests**

Create `tests/integration/notifications.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { approveRequest, createGroup, getInviteCode, requestToJoin } from "@/lib/groups";
import { createMeeting } from "@/lib/meetings";
import { setMeal } from "@/lib/meals";
import { createRecipe } from "@/lib/recipes";

// Who gets told is the point of these tests; the transport is mocked.
const push = vi.hoisted(() => ({
  sendToUsers: vi.fn().mockResolvedValue({ attempted: 0, failed: 0 }),
}));
vi.mock("@/lib/push", () => push);

const monitoring = vi.hoisted(() => ({
  logPushSent: vi.fn(),
  reportPushFailure: vi.fn(),
}));
vi.mock("@/lib/monitoring", () => monitoring);

import {
  notifyJoinRequested,
  notifyMealSet,
  notifyMeetingCreated,
  notifyRecipeAdded,
  notifyRequestApproved,
} from "@/lib/notifications";

async function mkUser(id: string, name = id) {
  await db.execute(sql`insert into "user" (id, name, email, email_verified, created_at, updated_at)
    values (${id}, ${name}, ${id + "@example.com"}, true, now(), now()) on conflict do nothing`);
  return id;
}

async function addMember(adminId: string, groupId: string, userId: string) {
  await requestToJoin(userId, await getInviteCode(groupId));
  const [req] = (await db.execute(
    sql`select id from join_requests where group_id = ${groupId} and user_id = ${userId} and status = 'pending'`,
  )).rows as { id: string }[];
  await approveRequest(adminId, req.id);
}

function recipientsOfLastSend(): string[] {
  const calls = push.sendToUsers.mock.calls;
  return [...(calls[calls.length - 1][0] as string[])].sort();
}

function payloadOfLastSend() {
  const calls = push.sendToUsers.mock.calls;
  return calls[calls.length - 1][1];
}

describe("notifications: who gets told", () => {
  let alice: string, bob: string, carol: string, dan: string, groupId: string, otherGroupId: string;

  beforeAll(async () => {
    alice = await mkUser(`u_n_alice_${crypto.randomUUID()}`, "Alice");
    bob = await mkUser(`u_n_bob_${crypto.randomUUID()}`, "Bob");
    carol = await mkUser(`u_n_carol_${crypto.randomUUID()}`, "Carol");
    dan = await mkUser(`u_n_dan_${crypto.randomUUID()}`, "Dan");
    ({ groupId } = await createGroup(alice, "Tuesday Group"));
    await addMember(alice, groupId, bob);
    await addMember(alice, groupId, carol);
    // Dan is in a different group only: he must never hear about this one.
    ({ groupId: otherGroupId } = await createGroup(dan, "Thursday Group"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    push.sendToUsers.mockResolvedValue({ attempted: 2, failed: 0 });
  });

  it("meeting created: everyone in the group but the actor", async () => {
    const { meetingId } = await createMeeting(bob, groupId, { title: "Game night", date: "2026-10-14" });
    await notifyMeetingCreated({ actorId: bob, meetingId });
    expect(recipientsOfLastSend()).toEqual([alice, carol].sort());
    expect(payloadOfLastSend()).toEqual({
      title: "Tuesday Group",
      body: "Bob added a meeting: Game night on Tue, Oct 14",
      url: `/meetings/${meetingId}`,
    });
    expect(monitoring.logPushSent).toHaveBeenCalledWith("meeting-created", { attempted: 2, failed: 0 });
  });

  it("meal set: everyone but the actor, naming the recipe", async () => {
    const { meetingId } = await createMeeting(alice, groupId, { title: "Week 3", date: "2026-10-21" });
    const { recipeId } = await createRecipe(alice, groupId, { name: "Tacos", items: ["Shells"] });
    await setMeal(carol, meetingId, recipeId);
    await notifyMealSet({ actorId: carol, meetingId });
    expect(recipientsOfLastSend()).toEqual([alice, bob].sort());
    expect(payloadOfLastSend()).toEqual({
      title: "Tuesday Group",
      body: "Carol set the meal for Tue, Oct 21: Tacos",
      url: `/meetings/${meetingId}`,
    });
  });

  it("recipe added: everyone but the actor", async () => {
    const { recipeId } = await createRecipe(alice, groupId, { name: "Chili", items: ["Beans"] });
    await notifyRecipeAdded({ actorId: alice, recipeId });
    expect(recipientsOfLastSend()).toEqual([bob, carol].sort());
    expect(payloadOfLastSend()).toEqual({
      title: "Tuesday Group",
      body: "Alice added a recipe: Chili",
      url: `/recipes/${recipeId}`,
    });
  });

  it("join requested: admins only", async () => {
    await notifyJoinRequested({ groupId, requesterId: dan });
    expect(recipientsOfLastSend()).toEqual([alice]);
    expect(payloadOfLastSend()).toEqual({ title: "Tuesday Group", body: "Dan asked to join", url: "/group" });
  });

  it("request approved: the requester alone", async () => {
    await notifyRequestApproved({ groupId: otherGroupId, userId: bob });
    expect(recipientsOfLastSend()).toEqual([bob]);
    expect(payloadOfLastSend()).toEqual({
      title: "Thursday Group",
      body: "You're in. Welcome to Thursday Group.",
      url: "/",
    });
  });

  it("a missing meeting is reported, not thrown", async () => {
    await expect(notifyMeetingCreated({ actorId: alice, meetingId: "nope" })).resolves.toBeUndefined();
    expect(push.sendToUsers).not.toHaveBeenCalled();
    expect(monitoring.reportPushFailure).toHaveBeenCalledTimes(1);
  });

  it("a transport fault is reported, not thrown", async () => {
    push.sendToUsers.mockRejectedValueOnce(new Error("network"));
    const { recipeId } = await createRecipe(alice, groupId, { name: "Soup", items: ["Stock"] });
    await expect(notifyRecipeAdded({ actorId: alice, recipeId })).resolves.toBeUndefined();
    expect(monitoring.reportPushFailure).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 4: Run to verify they fail**

Run: `pnpm vitest run tests/integration/notifications.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 5: Write the domain module**

Create `src/lib/notifications.ts`:

```ts
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { mealPlans, meetings, member, organization, recipes, user } from "@/db/schema";
import { logPushSent, reportPushFailure } from "@/lib/monitoring";
import { sendToUsers, type PushPayload } from "@/lib/push";
import { formatMeetingDate } from "@/lib/utils";

// One function per event. Each takes ids only and does its own lookups, so a
// server action calls it in one line inside after() and a future cron handler
// (the day-before meal reminder) can call the same thing. None of them throw:
// a notification that fails must never fail the save that caused it.
//
// The group's name is the title, because a member can be in several groups.
// The actor never hears about their own action.

const SHORT_DATE = { weekday: "short", month: "short", day: "numeric" } as const;

// Copy builders: pure, unit tested in src/lib/notifications.test.ts.

export function meetingCreatedCopy(i: {
  groupName: string; actorName: string; date: string; title: string; meetingId: string;
}): PushPayload {
  return {
    title: i.groupName,
    body: `${i.actorName} added a meeting: ${i.title} on ${formatMeetingDate(i.date, SHORT_DATE)}`,
    url: `/meetings/${i.meetingId}`,
  };
}

export function mealSetCopy(i: {
  groupName: string; actorName: string; date: string; recipeName: string; meetingId: string;
}): PushPayload {
  return {
    title: i.groupName,
    body: `${i.actorName} set the meal for ${formatMeetingDate(i.date, SHORT_DATE)}: ${i.recipeName}`,
    url: `/meetings/${i.meetingId}`,
  };
}

export function recipeAddedCopy(i: {
  groupName: string; actorName: string; recipeName: string; recipeId: string;
}): PushPayload {
  return {
    title: i.groupName,
    body: `${i.actorName} added a recipe: ${i.recipeName}`,
    url: `/recipes/${i.recipeId}`,
  };
}

export function joinRequestedCopy(i: { groupName: string; requesterName: string }): PushPayload {
  return { title: i.groupName, body: `${i.requesterName} asked to join`, url: "/group" };
}

export function requestApprovedCopy(i: { groupName: string }): PushPayload {
  return { title: i.groupName, body: `You're in. Welcome to ${i.groupName}.`, url: "/" };
}

// Recipient shapes.

async function groupMembersExcept(groupId: string, userId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: member.userId })
    .from(member)
    .where(and(eq(member.organizationId, groupId), ne(member.userId, userId)));
  return rows.map((r) => r.userId);
}

async function groupAdmins(groupId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: member.userId })
    .from(member)
    .where(and(eq(member.organizationId, groupId), eq(member.role, "admin")));
  return rows.map((r) => r.userId);
}

async function groupName(groupId: string): Promise<string> {
  const [row] = await db.select({ name: organization.name }).from(organization).where(eq(organization.id, groupId));
  if (!row) throw new Error("not-found");
  return row.name;
}

async function userName(userId: string): Promise<string> {
  const [row] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
  if (!row) throw new Error("not-found");
  return row.name;
}

// Runs an event end to end and swallows every failure into monitoring.
async function deliver(event: string, run: () => Promise<{ recipients: string[]; payload: PushPayload }>) {
  try {
    const { recipients, payload } = await run();
    const counts = await sendToUsers(recipients, payload);
    logPushSent(event, counts);
  } catch (err) {
    reportPushFailure(err);
  }
}

export async function notifyMeetingCreated(i: { actorId: string; meetingId: string }): Promise<void> {
  await deliver("meeting-created", async () => {
    const [meeting] = await db
      .select({ groupId: meetings.groupId, title: meetings.title, date: meetings.date })
      .from(meetings)
      .where(eq(meetings.id, i.meetingId));
    if (!meeting) throw new Error("not-found");
    const [name, actorName, recipients] = await Promise.all([
      groupName(meeting.groupId),
      userName(i.actorId),
      groupMembersExcept(meeting.groupId, i.actorId),
    ]);
    return {
      recipients,
      payload: meetingCreatedCopy({
        groupName: name, actorName, date: meeting.date, title: meeting.title, meetingId: i.meetingId,
      }),
    };
  });
}

export async function notifyMealSet(i: { actorId: string; meetingId: string }): Promise<void> {
  await deliver("meal-set", async () => {
    const [row] = await db
      .select({ groupId: meetings.groupId, date: meetings.date, recipeName: recipes.name })
      .from(mealPlans)
      .innerJoin(meetings, eq(meetings.id, mealPlans.meetingId))
      .innerJoin(recipes, eq(recipes.id, mealPlans.recipeId))
      .where(eq(mealPlans.meetingId, i.meetingId));
    if (!row) throw new Error("not-found");
    const [name, actorName, recipients] = await Promise.all([
      groupName(row.groupId),
      userName(i.actorId),
      groupMembersExcept(row.groupId, i.actorId),
    ]);
    return {
      recipients,
      payload: mealSetCopy({
        groupName: name, actorName, date: row.date, recipeName: row.recipeName, meetingId: i.meetingId,
      }),
    };
  });
}

export async function notifyRecipeAdded(i: { actorId: string; recipeId: string }): Promise<void> {
  await deliver("recipe-added", async () => {
    const [recipe] = await db
      .select({ groupId: recipes.groupId, name: recipes.name })
      .from(recipes)
      .where(eq(recipes.id, i.recipeId));
    if (!recipe) throw new Error("not-found");
    const [name, actorName, recipients] = await Promise.all([
      groupName(recipe.groupId),
      userName(i.actorId),
      groupMembersExcept(recipe.groupId, i.actorId),
    ]);
    return {
      recipients,
      payload: recipeAddedCopy({ groupName: name, actorName, recipeName: recipe.name, recipeId: i.recipeId }),
    };
  });
}

export async function notifyJoinRequested(i: { groupId: string; requesterId: string }): Promise<void> {
  await deliver("join-requested", async () => {
    const [name, requesterName, recipients] = await Promise.all([
      groupName(i.groupId),
      userName(i.requesterId),
      groupAdmins(i.groupId),
    ]);
    return { recipients, payload: joinRequestedCopy({ groupName: name, requesterName }) };
  });
}

export async function notifyRequestApproved(i: { groupId: string; userId: string }): Promise<void> {
  await deliver("request-approved", async () => {
    const name = await groupName(i.groupId);
    return { recipients: [i.userId], payload: requestApprovedCopy({ groupName: name }) };
  });
}
```

- [ ] **Step 6: Run both test files**

Run: `pnpm vitest run src/lib/notifications.test.ts tests/integration/notifications.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 7: Typecheck, lint, commit**

```bash
pnpm tsc --noEmit && pnpm eslint src/lib/notifications.ts && git add src/lib/notifications.ts src/lib/notifications.test.ts tests/integration/notifications.test.ts && git commit -m "Add notification events: copy and recipients for the five pushes"
```

---

### Task 4: Domain return values for the join flow

**Files:**
- Modify: `src/lib/groups.ts:81-131`
- Test: `tests/integration/groups.test.ts`

**Interfaces:**
- Produces: `requestToJoin(userId, code): Promise<{ groupId: string; groupName: string; created: boolean }>`; `approveRequest(userId, requestId): Promise<{ groupId: string; userId: string }>`.

- [ ] **Step 1: Write the failing tests**

Append inside the top-level `describe` of `tests/integration/groups.test.ts` (use the file's existing `mkUser` helper and user setup):

```ts
  it("requestToJoin reports whether it created a request, so a repeat tap doesn't re-ping admins", async () => {
    const { groupId } = await createGroup(alice, "Repeat taps");
    const code = await getInviteCode(groupId);
    expect((await requestToJoin(bob, code)).created).toBe(true);
    expect((await requestToJoin(bob, code)).created).toBe(false);
  });

  it("approveRequest returns the group and the new member", async () => {
    const { groupId } = await createGroup(alice, "Approval ids");
    await requestToJoin(bob, await getInviteCode(groupId));
    const [pending] = await listPendingRequests(groupId);
    expect(await approveRequest(alice, pending.id)).toEqual({ groupId, userId: bob });
  });
```

If `listPendingRequests` is not already imported in that file, add it to the import from `@/lib/groups`.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/integration/groups.test.ts`
Expected: FAIL on `.created` (undefined) and on `toEqual` (undefined).

- [ ] **Step 3: Change the two functions**

In `src/lib/groups.ts`, `requestToJoin`: replace the two return statements.

```ts
  if (existingPending) {
    return { groupId, groupName: group.name, created: false };
  }

  await db.insert(joinRequests).values({ groupId, userId });
  return { groupId, groupName: group.name, created: true };
```

`approveRequest`: after the transaction, add

```ts
  return { groupId: req.groupId, userId: req.userId };
```

- [ ] **Step 4: Run the groups tests**

Run: `pnpm vitest run tests/integration/groups.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm tsc --noEmit && git add src/lib/groups.ts tests/integration/groups.test.ts && git commit -m "Return what the join flow did, so actions can notify the right people"
```

---

### Task 5: Schedule the notifications from the five server actions

**Files:**
- Modify: `src/app/(app)/meetings/actions.ts` (`createMeetingAction`)
- Modify: `src/app/(app)/meals/actions.ts` (`setMealAction`)
- Modify: `src/app/(app)/recipes/actions.ts` (`createRecipeAction`)
- Modify: `src/app/(app)/join/actions.ts` (`requestToJoinAction`)
- Modify: `src/app/(app)/group/actions.ts` (`approveRequestAction`)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the five `notify*` functions from Task 3; `created`/ids from Task 4; `after` from `next/server`.

There is no unit harness for server actions in this repo; the behaviour is covered by Task 3's tests plus the e2e suite's existing flows still passing. Each edit is one `after()` line.

- [ ] **Step 1: Meeting created**

In `src/app/(app)/meetings/actions.ts`, add imports:

```ts
import { after } from "next/server";
import { notifyMeetingCreated } from "@/lib/notifications";
```

In `createMeetingAction`, change the domain call to capture the id and schedule the push:

```ts
  try {
    const { meetingId } = await createMeeting(user.id, groupId, form.data);
    // After the response: the save never waits on the push service.
    after(() => notifyMeetingCreated({ actorId: user.id, meetingId }));
  } catch (err) {
    return { error: mapError(err), success: false };
  }
```

- [ ] **Step 2: Meal set**

In `src/app/(app)/meals/actions.ts`, add the same two imports (with `notifyMealSet`), and in `setMealAction`:

```ts
  try {
    await setMeal(user.id, meetingId, recipeId);
    after(() => notifyMealSet({ actorId: user.id, meetingId }));
  } catch (err) {
```

- [ ] **Step 3: Recipe added**

In `src/app/(app)/recipes/actions.ts`, add imports (with `notifyRecipeAdded`), and in `createRecipeAction`:

```ts
  try {
    const { recipeId } = await createRecipe(user.id, groupId, form.data);
    after(() => notifyRecipeAdded({ actorId: user.id, recipeId }));
  } catch (err) {
```

- [ ] **Step 4: Join requested**

In `src/app/(app)/join/actions.ts`, add imports (with `notifyJoinRequested`), and in `requestToJoinAction`:

```ts
  try {
    const { groupId, created } = await requestToJoin(user.id, code);
    // Only a new request pings the admins; a repeat tap on the link does not.
    if (created) after(() => notifyJoinRequested({ groupId, requesterId: user.id }));
  } catch (err) {
```

- [ ] **Step 5: Request approved**

In `src/app/(app)/group/actions.ts`, add imports (with `notifyRequestApproved`), and in `approveRequestAction`:

```ts
  try {
    const { groupId, userId } = await approveRequest(user.id, requestId);
    after(() => notifyRequestApproved({ groupId, userId }));
  } catch (err) {
```

- [ ] **Step 6: Record the convention**

In `CLAUDE.md`, add a bullet under Conventions after the Monitoring bullet:

```
- Push notifications: `src/lib/push.ts` is the transport (subscriptions, `sendToUsers`), `src/lib/notifications.ts` has one `notify*` function per event, taking ids only. Server actions schedule them with `after()` once the save has succeeded; never await a push in the request. Copy and recipients are tested in `src/lib/notifications.test.ts` and `tests/integration/notifications.test.ts`.
```

- [ ] **Step 7: Typecheck, lint, full unit suite, commit**

```bash
pnpm tsc --noEmit && pnpm eslint . && pnpm vitest run && git add "src/app/(app)" CLAUDE.md && git commit -m "Send a push after a meeting, meal, recipe, join request, or approval"
```

---

### Task 6: Service worker handlers

**Files:**
- Modify: `src/app/sw.ts`

No automated test reaches the worker (Playwright has no push service). Verified by typecheck and by hand on a device at the end.

- [ ] **Step 1: Add the listeners**

Append to `src/app/sw.ts` after `serwist.addEventListeners();`:

```ts
// Web Push. The payload is { title, body, url } (src/lib/push.ts), encrypted
// end to end, so this is the first place it's readable. A payload that fails
// to parse is a bug, not something to show a member: skip it.
type PushPayload = { title: string; body: string; url: string };

self.addEventListener("push", (event) => {
  let payload: PushPayload;
  try {
    payload = event.data!.json() as PushPayload;
    if (!payload.title || !payload.body || !payload.url) return;
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      data: { url: payload.url },
    }),
  );
});

// Tapping a notification lands on the thing it was about, in the already-open
// app window when there is one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? "/";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((client) => "focus" in client);
      if (existing) {
        await existing.focus();
        if ("navigate" in existing) await existing.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
```

- [ ] **Step 2: Typecheck and build the worker**

```bash
pnpm tsc --noEmit && pnpm next build
```

Expected: build succeeds; `.next` contains the generated worker. (The build also needs `DATABASE_URL`, which `.env` provides.)

- [ ] **Step 3: Commit**

```bash
git add src/app/sw.ts && git commit -m "Show pushes from the service worker and open the right screen on tap"
```

---

### Task 7: Subscribe and unsubscribe actions

**Files:**
- Create: `src/app/(app)/settings/actions.ts`

**Interfaces:**
- Consumes: `pushSubscriptionInput`, `saveSubscription`, `deleteSubscription` from `@/lib/push`; `requireUser` from `@/lib/dal`; `logRefusal`.
- Produces:
  ```ts
  export type SubscribeState = { error: string | null };
  export async function subscribeAction(input: unknown): Promise<SubscribeState>
  export async function unsubscribeAction(endpoint: string): Promise<void>
  ```

The zod schema these use is tested in Task 2. The actions are thin.

- [ ] **Step 1: Write the actions**

Create `src/app/(app)/settings/actions.ts`:

```ts
"use server";

import { z } from "zod";
import { requireUser } from "@/lib/dal";
import { logRefusal } from "@/lib/monitoring";
import { deleteSubscription, pushSubscriptionInput, saveSubscription } from "@/lib/push";

export type SubscribeState = { error: string | null };

// The card posts PushSubscription.toJSON() plus the user agent. Parsed here,
// on the server, like every other action's input.
export async function subscribeAction(input: unknown): Promise<SubscribeState> {
  const user = await requireUser();
  const parsed = pushSubscriptionInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await saveSubscription(user.id, parsed.data);
  } catch (err) {
    logRefusal(err);
    throw err;
  }
  return { error: null };
}

const endpointInput = z.url({ protocol: /^https$/ });

export async function unsubscribeAction(endpoint: string): Promise<void> {
  const user = await requireUser();
  const parsed = endpointInput.safeParse(endpoint);
  // A malformed endpoint can't match a row anyway; nothing to do.
  if (!parsed.success) return;
  await deleteSubscription(user.id, parsed.data);
}
```

- [ ] **Step 2: Typecheck, lint, commit**

```bash
pnpm tsc --noEmit && pnpm eslint "src/app/(app)/settings/actions.ts" && git add "src/app/(app)/settings/actions.ts" && git commit -m "Add the subscribe and unsubscribe actions for push"
```

---

### Task 8: Card state function and the Notifications card

**Files:**
- Create: `src/lib/notifications-state.ts`
- Test: `src/lib/notifications-state.test.ts`
- Create: `src/components/notifications-card.tsx`
- Modify: `src/components/button-styling.test.ts` (`ALLOWED`)

**Interfaces:**
- Consumes: `subscribeAction`, `unsubscribeAction` from Task 7.
- Produces:
  ```ts
  export type CardState = "unsupported" | "blocked" | "on" | "off";
  export function cardState(i: { supported: boolean; permission: NotificationPermission; subscribed: boolean }): CardState
  export function NotificationsCard(): JSX.Element   // client component, no props
  ```

- [ ] **Step 1: Write the state tests**

Create `src/lib/notifications-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cardState } from "./notifications-state";

describe("cardState", () => {
  it("is unsupported wherever push can't work, whatever else is true", () => {
    expect(cardState({ supported: false, permission: "default", subscribed: false })).toBe("unsupported");
    expect(cardState({ supported: false, permission: "granted", subscribed: true })).toBe("unsupported");
    expect(cardState({ supported: false, permission: "denied", subscribed: false })).toBe("unsupported");
  });

  it("is blocked once permission was denied", () => {
    expect(cardState({ supported: true, permission: "denied", subscribed: false })).toBe("blocked");
    expect(cardState({ supported: true, permission: "denied", subscribed: true })).toBe("blocked");
  });

  it("reflects the browser's subscription otherwise", () => {
    expect(cardState({ supported: true, permission: "granted", subscribed: true })).toBe("on");
    expect(cardState({ supported: true, permission: "granted", subscribed: false })).toBe("off");
    expect(cardState({ supported: true, permission: "default", subscribed: false })).toBe("off");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/notifications-state.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the state function**

Create `src/lib/notifications-state.ts` (browser-safe: no zod, no db):

```ts
// What the Settings > Notifications card shows, from three facts the browser
// can report. Pure, so the decision is unit tested without a browser.
export type CardState = "unsupported" | "blocked" | "on" | "off";

export function cardState(i: {
  supported: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
}): CardState {
  if (!i.supported) return "unsupported";
  if (i.permission === "denied") return "blocked";
  return i.subscribed ? "on" : "off";
}

// iOS delivers Web Push only to Home Screen apps, never to a Safari tab, and
// does not expose PushManager outside one. Checked both ways to be sure.
export function pushSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return false;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (!isIOS) return true;
  return window.matchMedia("(display-mode: standalone)").matches;
}

// pushManager.subscribe wants the VAPID public key as bytes; the env var is
// the base64url string web-push generated.
export function urlBase64ToUint8Array(base64url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}
```

Add to the test file one more case:

```ts
describe("urlBase64ToUint8Array", () => {
  it("decodes base64url with missing padding", () => {
    // "hi" in base64url is "aGk" (padding stripped).
    expect(Array.from(urlBase64ToUint8Array("aGk"))).toEqual([104, 105]);
  });
});
```

and import `urlBase64ToUint8Array` alongside `cardState`.

- [ ] **Step 4: Run the state tests**

Run: `pnpm vitest run src/lib/notifications-state.test.ts`
Expected: PASS

- [ ] **Step 5: Add the ALLOWED entry for the switch**

In `src/components/button-styling.test.ts`, add to `ALLOWED`:

```ts
  "src/components/notifications-card.tsx": { count: 1, why: "the notifications switch" },
```

Run: `pnpm vitest run src/components/button-styling.test.ts`
Expected: FAIL (file doesn't exist yet so counts mismatch). That's the failing test for the card.

- [ ] **Step 6: Write the card**

Create `src/components/notifications-card.tsx`:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { cardState, pushSupported, urlBase64ToUint8Array, type CardState } from "@/lib/notifications-state";
import { subscribeAction, unsubscribeAction } from "@/app/(app)/settings/actions";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

const EXPLAINER = "A heads-up when someone adds a meeting, sets a meal, or shares a recipe.";

// One toggle per device. "On" means this browser holds a push subscription;
// the server row is kept in step by posting the subscription on mount (an
// idempotent upsert) and on every flip. Never prompts for permission on its
// own: the tap on the switch is what triggers the system prompt.
export function NotificationsCard() {
  const [state, setState] = useState<CardState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported = pushSupported();
      let subscribed = false;
      if (supported) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        subscribed = subscription !== null;
        // Keep the server's row current for whoever is signed in on this device.
        if (subscription) void subscribeAction(withUserAgent(subscription));
      }
      if (!cancelled) {
        setState(cardState({ supported, permission: supported ? Notification.permission : "default", subscribed }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle() {
    setError(null);
    startTransition(async () => {
      if (state === "on") {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          const endpoint = subscription.endpoint;
          await subscription.unsubscribe();
          await unsubscribeAction(endpoint);
        }
        setState("off");
        return;
      }
      if (!PUBLIC_KEY) {
        setError("Notifications aren't set up on this server yet.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      let subscription: PushSubscription;
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY) as BufferSource,
        });
      } catch {
        // Denied at the prompt (or the browser refused): reflect what it says now.
        setState(cardState({ supported: true, permission: Notification.permission, subscribed: false }));
        return;
      }
      const result = await subscribeAction(withUserAgent(subscription));
      if (result.error) {
        // The browser has a subscription the server never heard of: drop it.
        await subscription.unsubscribe();
        setError(result.error);
        setState("off");
        return;
      }
      setState("on");
    });
  }

  return (
    <div className="bg-card rounded-card shadow-card flex flex-col gap-2.5 p-4">
      <p id="notifications-label" className="text-muted-foreground tracking-label text-xs uppercase">
        Notifications
      </p>
      {state === "unsupported" ? (
        <p className="text-sm">
          Notifications need the Home Screen app. In Safari, tap Share, then Add to Home Screen, and open Small
          Group from there.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p id="notifications-switch-label" className="text-strong font-medium">
              Notify me on this device
            </p>
            {state !== null && (
              <button
                type="button"
                role="switch"
                aria-checked={state === "on"}
                aria-labelledby="notifications-switch-label"
                disabled={state === "blocked" || pending}
                onClick={toggle}
                className="min-h-tap flex shrink-0 items-center disabled:opacity-50"
              >
                <span
                  className={cn(
                    "relative h-7 w-12 rounded-full transition-colors",
                    state === "on" ? "bg-primary" : "bg-border",
                  )}
                >
                  <span
                    className={cn(
                      "bg-card absolute top-0.5 size-6 rounded-full shadow-card transition-transform",
                      state === "on" ? "translate-x-[22px]" : "translate-x-0.5",
                    )}
                  />
                </span>
              </button>
            )}
          </div>
          {state === "blocked" ? (
            <p className="text-tertiary text-xs">
              Notifications are blocked for Small Group. Turn them on in your phone&apos;s Settings, under
              Notifications.
            </p>
          ) : (
            <p className="text-tertiary text-xs">{EXPLAINER}</p>
          )}
          {error && <p className="text-destructive text-xs">{error}</p>}
        </>
      )}
    </div>
  );
}

function withUserAgent(subscription: PushSubscription) {
  return { ...subscription.toJSON(), userAgent: navigator.userAgent.slice(0, 512) };
}
```

Check the switch knob markup against `src/components/prayer-compose.tsx` lines 61 to 75 and copy its exact inner `<span>` classes if they differ, so the two switches look identical.

- [ ] **Step 7: Run the guard test and typecheck**

```bash
pnpm vitest run src/components/button-styling.test.ts && pnpm tsc --noEmit && pnpm eslint src/components/notifications-card.tsx src/lib/notifications-state.ts
```

Expected: PASS, clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/notifications-state.ts src/lib/notifications-state.test.ts src/components/notifications-card.tsx src/components/button-styling.test.ts && git commit -m "Add the Notifications card with its one toggle"
```

---

### Task 9: Settings page, gear, Group screen refactor, tab bar, e2e

**Files:**
- Create: `src/app/(app)/settings/page.tsx`
- Create: `src/components/settings-link.tsx`
- Modify: `src/app/(app)/group/page.tsx`
- Modify: `src/components/tab-bar.tsx`
- Create: `e2e/settings.spec.ts`
- Modify: `e2e/theme.spec.ts`, `e2e/report-problem.spec.ts`

**Interfaces:**
- Consumes: `NotificationsCard` (Task 8), existing `DisplayNameCard`, `AppearanceCard`, `ReportProblemDialog`, `SignOutButton`.

- [ ] **Step 1: Write the e2e spec**

Create `e2e/settings.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { expectApp, memberContext, signIn } from "./helpers";

test("the gear on the Group tab opens Settings with the personal controls", async ({ browser }) => {
  const run = Date.now();
  const page = await (await memberContext(browser)).newPage();
  await signIn(page, `settings-${run}@example.com`, "Sam");
  await page.getByRole("link", { name: "Create a group" }).click();
  await page.getByLabel("Group name").fill(`Settings ${run}`);
  await page.getByRole("button", { name: "Create group" }).click();
  await expectApp(page.getByRole("heading", { name: `Settings ${run}` })).toBeVisible();

  await page.getByRole("link", { name: "Group" }).click();
  // The personal cards have left the Group screen.
  await expectApp(page.getByTestId("member-row")).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Appearance" })).toHaveCount(0);

  await page.getByRole("link", { name: "Settings" }).click();
  await expectApp(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText(`settings-${run}@example.com`)).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Appearance" })).toBeVisible();
  // Headless Chromium has PushManager and permission "default": the toggle is off.
  const toggle = page.getByRole("switch", { name: "Notify me on this device" });
  await expectApp(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  // The Group tab stays lit while on Settings.
  await expect(page.getByRole("link", { name: "Group" })).toHaveClass(/text-accent-strong/);
});
```

- [ ] **Step 2: Update the two existing specs**

In `e2e/theme.spec.ts`, after `await page.getByRole("link", { name: "Group" }).click();` add:

```ts
  await page.getByRole("link", { name: "Settings" }).click();
```

and rename the test title to `"the Settings page's appearance choice overrides the system theme and sticks"`.

In `e2e/report-problem.spec.ts`, after the Group click add the same Settings click, and rename the title to `"a member reports a problem from Settings"`.

- [ ] **Step 3: Write the gear link**

Create `src/components/settings-link.tsx`:

```tsx
import Link from "next/link";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

// The gear in the Group header. Settings holds what is personal to the member
// (name, appearance, notifications, sign out); the Group screen is the group's.
export function SettingsLink() {
  return (
    <Button render={<Link href="/settings" />} variant="secondary" size="icon" aria-label="Settings">
      <Settings />
    </Button>
  );
}
```

- [ ] **Step 4: Write the Settings page**

Create `src/app/(app)/settings/page.tsx`:

```tsx
import { requireUser } from "@/lib/dal";
import { AppearanceCard } from "@/components/appearance-card";
import { DisplayNameCard } from "@/components/display-name-card";
import { NotificationsCard } from "@/components/notifications-card";
import { ReportProblemDialog } from "@/components/report-problem-dialog";
import { SignOutButton } from "@/components/sign-out-button";

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <main className="flex flex-col gap-4 p-6">
      <h1 className="font-serif text-3xl font-semibold">Settings</h1>

      <DisplayNameCard name={user.name} email={user.email} />

      <AppearanceCard />

      <NotificationsCard />

      <div className="flex flex-col items-center gap-2 pb-4 pt-2">
        <ReportProblemDialog label="Report a problem" look="inline" />
        <SignOutButton />
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Refactor the Group page**

In `src/app/(app)/group/page.tsx`:

Remove these imports: `SignOutButton`, `AppearanceCard`, `DisplayNameCard`, `ReportProblemDialog`. Add:

```ts
import { SettingsLink } from "@/components/settings-link";
```

Replace the header block:

```tsx
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <GroupNameHeader groupId={activeGroup.id} name={activeGroup.name} isAdmin={isAdmin} />
          </div>
          <SettingsLink />
        </div>
        <p className="text-muted-foreground text-sm">
          {memberCount} member{memberCount === 1 ? "" : "s"}
          {isAdmin ? " · you're an admin" : ""}
        </p>
      </div>
```

Remove the `<DisplayNameCard ... />`, `<AppearanceCard />`, and the whole `<div className="flex flex-col items-center gap-2 pb-4">...</div>` containing Report a problem and Sign out. Keep `<LeaveGroupButton ... />` as the last element in `<main>`, and give it breathing room by wrapping it: `<div className="pb-4"><LeaveGroupButton groupId={activeGroup.id} /></div>`.

`user` is still needed for `isSelf` on member rows; keep `requireUser()`.

- [ ] **Step 6: Tab bar**

In `src/components/tab-bar.tsx`, change the `active` computation:

```ts
        const active =
          href === "/"
            ? pathname === "/" || pathname.startsWith("/meetings/")
            : href === "/group"
              ? pathname === "/group" || pathname.startsWith("/settings")
              : pathname === href || pathname.startsWith(`${href}/`);
```

- [ ] **Step 7: Typecheck, lint, unit tests**

```bash
pnpm tsc --noEmit && pnpm eslint . && pnpm vitest run
```

Expected: all pass (the guard test's `ALLOWED` counts still match: the gear uses `render={<Link />}` inside `<Button>`, which the scanner accepts).

- [ ] **Step 8: Build and run e2e on a spare port**

Port 3000 can be another worktree's server (see memory). Run:

```bash
pnpm next build && BETTER_AUTH_URL=http://localhost:3300 PORT=3300 pnpm next start &
sleep 5 && PLAYWRIGHT_BASE_URL=http://localhost:3300 pnpm playwright test --config playwright.config.ts
```

If the config does not read `PLAYWRIGHT_BASE_URL`, run e2e the standard way (`pnpm playwright test`) after confirming nothing else is on 3000 with `lsof -i :3000`.

Expected: all specs pass, including `settings.spec.ts`, the renamed theme and report-problem specs, and `auth-groups.spec.ts` (whose join flow now schedules two pushes that the unconfigured transport skips with a console line).

- [ ] **Step 9: Commit**

```bash
git add "src/app/(app)/settings/page.tsx" src/components/settings-link.tsx "src/app/(app)/group/page.tsx" src/components/tab-bar.tsx e2e/settings.spec.ts e2e/theme.spec.ts e2e/report-problem.spec.ts && git commit -m "Move personal controls to a Settings screen behind a gear on Group"
```

---

### Task 10: Verify and open the PR

**Files:** none new.

- [ ] **Step 1: Full verification**

```bash
pnpm tsc --noEmit && pnpm eslint . && pnpm vitest run && pnpm next build
```

Expected: all green. Paste the summary lines into the PR description.

- [ ] **Step 2: Push the branch and open a PR against main**

The branch is already `claude/app-notifications-pwa-f53b9f`. Push and open the PR with `gh pr create`, titled "Push notifications and a Settings screen". The body lists: what fires, where the toggle is, the three env vars the owner must add to Vercel before merging (`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, generated with `npx web-push generate-vapid-keys`), the by-hand iPhone checks from the spec's Testing section, and a link to the spec. End with the mandated attribution line. Do not merge: the user merges.

- [ ] **Step 3: Stop**

Report the PR link, the verification output, and the owner's pre-merge steps.
