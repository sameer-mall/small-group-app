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
    expect(
      pushSubscriptionInput.safeParse({ endpoint: "https://push.example/abc", keys: { p256dh: "k" } }).success,
    ).toBe(false);
    expect(
      pushSubscriptionInput.safeParse({ ...subscription("https://push.example/abc"), userAgent: "x".repeat(600) })
        .success,
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
