"use client";

import { startTransition, useActionState, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { setMealAction, type ActionState } from "@/app/(app)/meals/actions";
import type { RecipeSummary } from "@/lib/recipes";

const initialState: ActionState = { error: null, success: false };

function RecipeChoice({
  recipe,
  meetingId,
  onChosen,
}: {
  recipe: RecipeSummary;
  meetingId: string;
  onChosen: () => void;
}) {
  const [state, action] = useActionState(
    setMealAction.bind(null, meetingId, recipe.id),
    initialState,
  );

  // Close the picker once the choice lands — adjusted during render rather
  // than in an effect, the same pattern as new-meeting-sheet.tsx.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.success) onChosen();
  }

  return (
    <div className="border-divider flex flex-col border-b last:border-b-0">
      <button
        type="button"
        onClick={() => startTransition(() => action(new FormData()))}
        className="min-h-tap flex w-full flex-col items-start justify-center py-2.5 text-left"
      >
        <span className="font-serif text-base font-semibold">{recipe.name}</span>
        <span className="text-muted-foreground text-sm">
          {recipe.itemCount} item{recipe.itemCount === 1 ? "" : "s"}
        </span>
      </button>
      {state.error && <p className="text-destructive pb-2 text-xs">{state.error}</p>}
    </div>
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
      <DialogTrigger className="bg-primary text-primary-foreground rounded-input min-h-tap flex w-full items-center justify-center px-4 py-3.5 text-base font-bold">
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
          <div className="flex max-h-[60dvh] flex-col overflow-y-auto">
            {recipes.map((recipe) => (
              <RecipeChoice
                key={recipe.id}
                recipe={recipe}
                meetingId={meetingId}
                onChosen={() => setOpen(false)}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
