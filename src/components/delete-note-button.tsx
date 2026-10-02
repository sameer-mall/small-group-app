"use client";

import { startTransition, useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteNoteAction, type ActionState } from "@/app/(app)/notes/actions";

const initialState: ActionState = { error: null, success: false };

export function DeleteNoteButton({ noteId }: { noteId: string }) {
  const [open, setOpen] = useState(false);
  const [state, deleteAction] = useActionState(deleteNoteAction.bind(null, noteId), initialState);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-destructive min-h-tap self-start text-sm font-semibold"
      >
        Delete note
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this note?</DialogTitle>
            <DialogDescription>
              {"Its meeting is already gone, so this is the only copy. It can't be undone."}
            </DialogDescription>
          </DialogHeader>
          {state.error && <p className="text-destructive text-xs">{state.error}</p>}
          {/* Cancel takes focus and sits nearest the top; the destructive
              button is at the far end, away from the tap that opened this.
              flex-col cancels the footer's default flex-col-reverse. */}
          <DialogFooter className="flex-col sm:flex-row">
            <DialogClose render={<Button variant="outline" type="button" autoFocus />}>
              Cancel
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              className="min-h-tap"
              onClick={() => startTransition(() => deleteAction(new FormData()))}
            >
              Delete note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
