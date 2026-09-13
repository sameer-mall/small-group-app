import { asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { user } from "@/db/auth-schema";
import {
  itemClaims,
  mealPlanItems,
  mealPlans,
  meetings,
  recipeItems,
  recipes,
} from "@/db/schema";
import { requireMembership } from "@/lib/membership";

export type MealPlanItem = {
  id: string;
  label: string;
  position: number;
  source: "recipe" | "adhoc";
  addedBy: string | null;
  addedByName: string | null;
  claimedBy: string | null;
  claimedByName: string | null;
};

export type MealPlan = {
  meetingId: string;
  recipeId: string | null;
  recipeName: string | null;
  items: MealPlanItem[];
};

// Loads the meeting and confirms the actor belongs to its group. Every entry
// point here starts from a meeting id the client supplied, so the group is
// always read back off the row rather than trusted from the caller.
async function requireMeetingMember(userId: string, meetingId: string) {
  const [meeting] = await db
    .select({ id: meetings.id, groupId: meetings.groupId })
    .from(meetings)
    .where(eq(meetings.id, meetingId));
  if (!meeting) throw new Error("not-found");
  const membership = await requireMembership(userId, meeting.groupId);
  return { meeting, membership };
}

// Replaces whatever the meeting had planned. The items are *copied* out of the
// recipe rather than referenced, so a later edit to the recipe never rewrites
// a week that has already happened — and deleting the recipe only nulls
// `recipeId`, leaving the copies standing.
export async function setMeal(
  userId: string,
  meetingId: string,
  recipeId: string,
): Promise<void> {
  const { meeting } = await requireMeetingMember(userId, meetingId);

  // The recipe is read inside the transaction alongside the write, so a
  // concurrent edit to that recipe cannot land between "read its items" and
  // "copy them" and leave the plan holding half of each version.
  await db.transaction(async (tx) => {
    const [recipe] = await tx
      .select({ id: recipes.id, groupId: recipes.groupId })
      .from(recipes)
      .where(eq(recipes.id, recipeId));
    // Same-group check, not merely existence: without it a member could plant
    // another group's recipe into their own meeting by guessing an id.
    if (!recipe || recipe.groupId !== meeting.groupId) throw new Error("not-found");

    const items = await tx
      .select({ label: recipeItems.label, position: recipeItems.position })
      .from(recipeItems)
      .where(eq(recipeItems.recipeId, recipeId))
      .orderBy(asc(recipeItems.position));

    // Claims cascade from the items, so clearing the items clears the claims.
    await tx.delete(mealPlanItems).where(eq(mealPlanItems.meetingId, meetingId));
    await tx
      .insert(mealPlans)
      .values({ meetingId, recipeId, setBy: userId, setAt: new Date() })
      .onConflictDoUpdate({
        target: mealPlans.meetingId,
        set: { recipeId, setBy: userId, setAt: new Date() },
      });
    if (items.length > 0) {
      await tx.insert(mealPlanItems).values(
        items.map((item) => ({
          meetingId,
          label: item.label,
          position: item.position,
          source: "recipe" as const,
        })),
      );
    }
  });
}

export async function getMealPlan(meetingId: string): Promise<MealPlan | null> {
  const [plan] = await db
    .select({
      meetingId: mealPlans.meetingId,
      recipeId: mealPlans.recipeId,
      recipeName: recipes.name,
    })
    .from(mealPlans)
    .leftJoin(recipes, eq(recipes.id, mealPlans.recipeId))
    .where(eq(mealPlans.meetingId, meetingId));
  if (!plan) return null;

  // `user` is joined twice — once for whoever added an ad-hoc item, once for
  // whoever claimed it — so each join needs its own alias.
  const adder = alias(user, "adder");
  const claimer = alias(user, "claimer");

  const items = await db
    .select({
      id: mealPlanItems.id,
      label: mealPlanItems.label,
      position: mealPlanItems.position,
      source: mealPlanItems.source,
      addedBy: mealPlanItems.addedBy,
      addedByName: adder.name,
      claimedBy: itemClaims.userId,
      claimedByName: claimer.name,
    })
    .from(mealPlanItems)
    .leftJoin(adder, eq(adder.id, mealPlanItems.addedBy))
    .leftJoin(itemClaims, eq(itemClaims.itemId, mealPlanItems.id))
    .leftJoin(claimer, eq(claimer.id, itemClaims.userId))
    .where(eq(mealPlanItems.meetingId, meetingId))
    .orderBy(asc(mealPlanItems.position));

  return { ...plan, items };
}

// An extra somebody brings on top of the recipe — "I'll also bring brownies".
// Appends to the end of the list; claimable like any other item.
export async function addAdhocItem(
  userId: string,
  meetingId: string,
  label: string,
): Promise<{ itemId: string }> {
  await requireMeetingMember(userId, meetingId);

  const [plan] = await db
    .select({ meetingId: mealPlans.meetingId })
    .from(mealPlans)
    .where(eq(mealPlans.meetingId, meetingId));
  // Items hang off the plan row, so there has to be a meal before extras.
  if (!plan) throw new Error("not-found");

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${mealPlanItems.position}) + 1, 0)::int` })
    .from(mealPlanItems)
    .where(eq(mealPlanItems.meetingId, meetingId));

  const [row] = await db
    .insert(mealPlanItems)
    .values({ meetingId, label, position: next, source: "adhoc", addedBy: userId })
    .returning({ id: mealPlanItems.id });
  return { itemId: row.id };
}

// Removable by the member who added it, or by a group admin — and only while
// nobody has claimed it, so a removal never yanks a commitment out from under
// the person who made it.
export async function removeAdhocItem(userId: string, itemId: string): Promise<void> {
  const [item] = await db
    .select({
      id: mealPlanItems.id,
      meetingId: mealPlanItems.meetingId,
      source: mealPlanItems.source,
      addedBy: mealPlanItems.addedBy,
    })
    .from(mealPlanItems)
    .where(eq(mealPlanItems.id, itemId));
  if (!item) throw new Error("not-found");

  const { membership } = await requireMeetingMember(userId, item.meetingId);

  // Copied recipe items are not individually removable — changing the recipe
  // is how the list changes.
  if (item.source !== "adhoc") throw new Error("forbidden");
  if (item.addedBy !== userId && membership.role !== "admin") throw new Error("forbidden");

  const [claimed] = await db
    .select({ itemId: itemClaims.itemId })
    .from(itemClaims)
    .where(eq(itemClaims.itemId, itemId));
  if (claimed) throw new Error("forbidden");

  await db.delete(mealPlanItems).where(eq(mealPlanItems.id, itemId));
}
