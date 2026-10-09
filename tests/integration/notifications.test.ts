import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { approveRequest, createGroup, getInviteCode, requestToJoin } from "@/lib/groups";
import { createMeeting } from "@/lib/meetings";
import { setMeal } from "@/lib/meals";
import { createRecipe } from "@/lib/recipes";

// Who gets told is the point of these tests; the transport is mocked.
const push = vi.hoisted(() => ({
  sendToUsers: vi.fn(),
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
    const { meetingId } = await createMeeting(bob, groupId, { title: "Game night", date: "2026-10-13" });
    await notifyMeetingCreated({ actorId: bob, meetingId });
    expect(recipientsOfLastSend()).toEqual([alice, carol].sort());
    expect(payloadOfLastSend()).toEqual({
      title: "Tuesday Group",
      body: "Bob added a meeting: Game night on Tue, Oct 13",
      url: `/meetings/${meetingId}`,
    });
    expect(monitoring.logPushSent).toHaveBeenCalledWith("meeting-created", { attempted: 2, failed: 0 });
  });

  it("meal set: everyone but the actor, naming the recipe", async () => {
    const { meetingId } = await createMeeting(alice, groupId, { title: "Week 3", date: "2026-10-20" });
    const { recipeId } = await createRecipe(alice, groupId, { name: "Tacos", items: ["Shells"] });
    await setMeal(carol, meetingId, recipeId);
    await notifyMealSet({ actorId: carol, meetingId });
    expect(recipientsOfLastSend()).toEqual([alice, bob].sort());
    expect(payloadOfLastSend()).toEqual({
      title: "Tuesday Group",
      body: "Carol set the meal for Tue, Oct 20: Tacos",
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
