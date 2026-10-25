"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { setMealAction, type ActionState } from "@/app/(app)/meals/actions";
import type { RecipeSummary } from "@/lib/recipes";
import { cn } from "@/lib/utils";

const initialState: ActionState = { error: null, success: false };

// The recipes to choose from, sharing one save. While a pick is saving every
// row is disabled, so a second tap (on the same recipe or another) can't queue
// another save and another notification behind it. The meeting's current
// recipe is marked and can't be picked again.
export function RecipeChoices({
  recipes,
  meetingId,
  currentRecipeId = null,
  onChosen,
  className,
}: {
  recipes: RecipeSummary[];
  meetingId: string;
  currentRecipeId?: string | null;
  onChosen: () => void;
  // The scrolling list's sizing, which differs between the two dialogs.
  className?: string;
}) {
  // `pending` only turns true on the next render, so two taps in the same
  // frame would both get through. The ref closes that gap.
  const saving = useRef(false);
  const [state, action, pending] = useActionState(
    async (prev: ActionState, recipeId: string) => {
      try {
        const result = await setMealAction(meetingId, recipeId, prev, new FormData());
        // Close the picker once the choice lands.
        if (result.success) onChosen();
        return result;
      } finally {
        saving.current = false;
      }
    },
    initialState,
  );

  function choose(recipeId: string) {
    if (saving.current) return;
    saving.current = true;
    startTransition(() => action(recipeId));
  }

  return (
    <>
      {state.error && <p className="text-destructive text-xs">{state.error}</p>}
      <div className={cn("flex flex-col overflow-y-auto", className)} aria-busy={pending}>
        {recipes.map((recipe) => {
          const current = recipe.id === currentRecipeId;
          return (
            <div key={recipe.id} className="border-divider flex flex-col border-b last:border-b-0">
              <button
                type="button"
                onClick={() => choose(recipe.id)}
                disabled={pending || current}
                className={cn(
                  "min-h-tap flex w-full flex-col items-start justify-center py-2.5 text-left transition-opacity disabled:cursor-default",
                  pending && "opacity-50",
                )}
              >
                <span className="flex w-full items-baseline justify-between gap-3">
                  <span className="font-serif text-base font-semibold">{recipe.name}</span>
                  {current && (
                    <span className="text-tertiary tracking-label shrink-0 text-xs font-bold uppercase">
                      Current
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground text-sm">
                  {recipe.itemCount} item{recipe.itemCount === 1 ? "" : "s"}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function RecipePicker({
  meetingId,
  recipes,
  label = "Pick a recipe",
}: {
  meetingId: string;
  recipes: RecipeSummary[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="block" />}>
        {label}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif text-xl font-semibold">Pick a recipe</DialogTitle>
        </DialogHeader>
        {recipes.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No recipes yet. Save one in the Recipes tab first.
          </p>
        ) : (
          <RecipeChoices
            recipes={recipes}
            meetingId={meetingId}
            onChosen={() => setOpen(false)}
            className="max-h-[60dvh]"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
