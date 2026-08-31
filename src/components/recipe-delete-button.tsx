"use client";

import { startTransition, useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteRecipeAction, type ActionState } from "@/app/(app)/recipes/actions";

const initialState: ActionState = { error: null, success: false };

export function RecipeDeleteButton({ recipeId }: { recipeId: string }) {
  const [state, action] = useActionState(
    deleteRecipeAction.bind(null, recipeId),
    initialState,
  );

  return (
    <Dialog>
      <DialogTrigger className="text-destructive min-h-tap text-sm font-semibold">
        Delete recipe
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this recipe?</DialogTitle>
          <DialogDescription>
            Meals already planned from it keep their own items.
          </DialogDescription>
        </DialogHeader>
        {state.error && <p className="text-destructive text-xs">{state.error}</p>}
        {/* Cancel takes focus and sits nearest the top; the destructive
            button is at the far end, away from the trigger's tap path.
            flex-col cancels the footer's default flex-col-reverse, which
            would otherwise surface Delete right under the tap that opened
            this. */}
        <DialogFooter className="flex-col sm:flex-row">
          <DialogClose render={<Button variant="outline" type="button" autoFocus />}>
            Cancel
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            className="min-h-tap"
            onClick={() => startTransition(() => action(new FormData()))}
          >
            Delete recipe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
