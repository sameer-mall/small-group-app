import { getMealPlan } from "@/lib/meals";
import { listRecipes } from "@/lib/recipes";
import { MealSlotRow } from "@/components/meal-slot-row";
import { RecipePicker } from "@/components/recipe-picker";
import { RefreshOnFocus } from "@/components/refresh-on-focus";
import { AddAdhocItem } from "@/components/add-adhoc-item";
import { ChangeMealDialog } from "@/components/change-meal-dialog";

// Composes the meal plan for one meeting. Membership was already confirmed by
// the page that renders this (see meetings/[id]/page.tsx) — getMealPlan and
// listRecipes do no authorization of their own.
export async function MealSection({
  meetingId,
  groupId,
  currentUserId,
  isAdmin,
}: {
  meetingId: string;
  groupId: string;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [plan, recipes] = await Promise.all([getMealPlan(meetingId), listRecipes(groupId)]);

  if (!plan) {
    return (
      <section className="flex flex-col gap-3">
        <RefreshOnFocus />
        <div className="flex flex-col gap-1">
          <h2 className="font-serif text-xl font-semibold">No meal planned yet</h2>
          <p className="text-muted-foreground text-sm">
            Pick a recipe and its items become claimable slots.
          </p>
        </div>
        <RecipePicker meetingId={meetingId} recipes={recipes} />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <RefreshOnFocus />
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-tertiary tracking-label text-xs font-bold uppercase">Meal</span>
          <h2 className="font-serif text-xl font-semibold break-words">
            {plan.recipeName ?? "This week's meal"}
          </h2>
        </div>
        <ChangeMealDialog
          meetingId={meetingId}
          recipes={recipes}
          hasClaims={plan.items.some((item) => item.claimedBy !== null)}
        />
      </div>
      <div className="bg-card rounded-card shadow-card flex flex-col px-4">
        {plan.items.map((item) => (
          <MealSlotRow
            key={item.id}
            item={item}
            meetingId={meetingId}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
          />
        ))}
      </div>
      <AddAdhocItem meetingId={meetingId} />
    </section>
  );
}
