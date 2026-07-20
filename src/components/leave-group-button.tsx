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
import { leaveGroupAction, type ActionState } from "@/app/(app)/group/actions";

const initialState: ActionState = { error: null, success: false };

export function LeaveGroupButton({ groupId }: { groupId: string }) {
  const [state, action] = useActionState(
    leaveGroupAction.bind(null, groupId),
    initialState,
  );

  return (
    <div className="flex flex-col items-center gap-1.5 pt-2 pb-6">
      <Dialog>
        <DialogTrigger className="text-destructive text-sm font-semibold">
          Leave group
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave this group?</DialogTitle>
            <DialogDescription>You&apos;ll need a new invite link to rejoin.</DialogDescription>
          </DialogHeader>
          {state.error && <p className="text-destructive text-xs">{state.error}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => startTransition(() => action(new FormData()))}
            >
              Leave group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
