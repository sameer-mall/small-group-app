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

// Every link goes through /open (src/app/open/route.ts), which switches the app
// to this group before showing the screen. Screens show whichever group the
// member last had open, so a bare path could land in the wrong one.
function inGroup(groupId: string, path: string): string {
  return `/open?${new URLSearchParams({ group: groupId, next: path })}`;
}

// Copy builders: pure, unit tested in src/lib/notifications.test.ts.

export function meetingCreatedCopy(i: {
  groupId: string;
  groupName: string;
  actorName: string;
  date: string;
  title: string;
  meetingId: string;
}): PushPayload {
  return {
    title: i.groupName,
    body: `${i.actorName} added a meeting: ${i.title} on ${formatMeetingDate(i.date, SHORT_DATE)}`,
    url: inGroup(i.groupId, `/meetings/${i.meetingId}`),
  };
}

export function mealSetCopy(i: {
  groupId: string;
  groupName: string;
  actorName: string;
  date: string;
  recipeName: string;
  meetingId: string;
}): PushPayload {
  return {
    title: i.groupName,
    body: `${i.actorName} set the meal for ${formatMeetingDate(i.date, SHORT_DATE)}: ${i.recipeName}`,
    url: inGroup(i.groupId, `/meetings/${i.meetingId}`),
  };
}

export function recipeAddedCopy(i: {
  groupId: string;
  groupName: string;
  actorName: string;
  recipeName: string;
  recipeId: string;
}): PushPayload {
  return {
    title: i.groupName,
    body: `${i.actorName} added a recipe: ${i.recipeName}`,
    url: inGroup(i.groupId, `/recipes/${i.recipeId}`),
  };
}

export function joinRequestedCopy(i: {
  groupId: string;
  groupName: string;
  requesterName: string;
}): PushPayload {
  return {
    title: i.groupName,
    body: `${i.requesterName} asked to join`,
    url: inGroup(i.groupId, "/group"),
  };
}

export function requestApprovedCopy(i: { groupId: string; groupName: string }): PushPayload {
  return {
    title: i.groupName,
    body: `You're in. Welcome to ${i.groupName}.`,
    url: inGroup(i.groupId, "/"),
  };
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
  const [row] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, groupId));
  if (!row) throw new Error("not-found");
  return row.name;
}

async function userName(userId: string): Promise<string> {
  const [row] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
  if (!row) throw new Error("not-found");
  return row.name;
}

// Runs an event end to end and swallows every failure into monitoring.
async function deliver(
  event: string,
  run: () => Promise<{ recipients: string[]; payload: PushPayload }>,
): Promise<void> {
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
        groupId: meeting.groupId,
        groupName: name,
        actorName,
        date: meeting.date,
        title: meeting.title,
        meetingId: i.meetingId,
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
        groupId: row.groupId,
        groupName: name,
        actorName,
        date: row.date,
        recipeName: row.recipeName,
        meetingId: i.meetingId,
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
      payload: recipeAddedCopy({
        groupId: recipe.groupId,
        groupName: name,
        actorName,
        recipeName: recipe.name,
        recipeId: i.recipeId,
      }),
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
    return {
      recipients,
      payload: joinRequestedCopy({ groupId: i.groupId, groupName: name, requesterName }),
    };
  });
}

export async function notifyRequestApproved(i: { groupId: string; userId: string }): Promise<void> {
  await deliver("request-approved", async () => {
    const name = await groupName(i.groupId);
    return {
      recipients: [i.userId],
      payload: requestApprovedCopy({ groupId: i.groupId, groupName: name }),
    };
  });
}
