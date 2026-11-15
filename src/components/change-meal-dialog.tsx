"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RecipeChoices } from "@/components/recipe-picker";
import type { RecipeSummary } from "@/lib/recipes";

export function ChangeMealDialog({
  meetingId,
  recipes,
  currentRecipeId,
  hasClaims,
}: {
  meetingId: string;
  recipes: RecipeSummary[];
  // Null when the recipe the meal came from has since been deleted.
  currentRecipeId: string | null;
  hasClaims: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="secondary" size="pill" />}>
        Change recipe
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change recipe?</DialogTitle>
          {hasClaims && (
            <DialogDescription>
              This clears the current items and everyone&apos;s claims.
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Cancel sits above the list and takes focus, keeping the choices —
            which are the destructive action here — clear of the tap that
            opened this. Same rule as the delete confirms in
            meeting-actions-menu.tsx. */}
        <DialogClose render={<Button variant="outline" type="button" autoFocus />}>
          Cancel
        </DialogClose>

        {recipes.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No recipes yet. Save one in the Recipes tab first.
          </p>
        ) : (
          <RecipeChoices
            recipes={recipes}
            meetingId={meetingId}
            currentRecipeId={currentRecipeId}
            onChosen={() => setOpen(false)}
            className="max-h-[50dvh]"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
