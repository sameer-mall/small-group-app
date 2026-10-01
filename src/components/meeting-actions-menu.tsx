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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deleteMeetingAction,
  updateMeetingAction,
  type ActionState,
} from "@/app/(app)/meetings/actions";
import type { Meeting } from "@/lib/meetings";

const initialState: ActionState = { error: null, success: false };

export function MeetingActionsMenu({ meeting }: { meeting: Meeting }) {
  // Both dialogs are controlled from here and rendered as siblings of the
  // menu, not inside a DropdownMenuItem: the menu unmounts its content when
  // it closes, which would tear a nested dialog down on the same tap that
  // opened it.
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [editState, editAction] = useActionState(
    updateMeetingAction.bind(null, meeting.id),
    initialState,
  );
  const [deleteState, deleteAction] = useActionState(
    deleteMeetingAction.bind(null, meeting.id),
    initialState,
  );

  // Close the edit dialog the moment a submit succeeds — adjusted during
  // render rather than in an effect, the same pattern as
  // src/components/new-meeting-sheet.tsx.
  const [handledState, setHandledState] = useState(editState);
  if (editState !== handledState) {
    setHandledState(editState);
    if (editState.success) setEditOpen(false);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="text-tertiary min-h-tap flex min-w-[32px] items-center justify-center text-lg"
          aria-label="Meeting actions"
        >
          &#8943;
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>Edit</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            Delete meeting
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif text-xl font-semibold">Edit meeting</DialogTitle>
          </DialogHeader>
          <form action={editAction} className="flex flex-col gap-3">
            <input
              name="title"
              defaultValue={meeting.title}
              placeholder="Meeting title"
              required
              enterKeyHint="next"
              className="bg-card border-border focus:border-primary rounded-input min-h-tap w-full border-[1.5px] px-4 py-3.5 text-[16px] outline-none"
            />
            <input
              name="date"
              type="date"
              defaultValue={meeting.date}
              required
              className="bg-card border-border focus:border-primary rounded-input min-h-tap w-full border-[1.5px] px-4 py-3.5 text-[16px] outline-none"
            />
            {editState.error && <p className="text-destructive text-xs">{editState.error}</p>}
            <Button type="submit" size="lg" className="min-h-tap w-full font-bold">
              Save changes
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this meeting?</DialogTitle>
            <DialogDescription>
              Its meal plan, claims, and prayer bowl are deleted with it.
            </DialogDescription>
          </DialogHeader>
          {deleteState.error && <p className="text-destructive text-xs">{deleteState.error}</p>}
          {/* Cancel takes focus and sits nearest the top; the destructive
              button is at the far end, away from the ⋯ trigger's tap path.
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
              onClick={() => startTransition(() => deleteAction(new FormData()))}
            >
              Delete meeting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
