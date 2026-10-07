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
