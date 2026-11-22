"use client";

import { startTransition, useActionState, useState } from "react";
import type { WallPerson } from "@/lib/prayers";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { notJoinedCallout, waitingCaption } from "@/components/assign-prayers-copy";
import { assignPrayersAction, type ActionState } from "@/app/(app)/prayers/actions";

const initialState: ActionState = { error: null, success: false };

export function AssignPrayersButton({
  meetingId,
  requestCount,
  writing,
  notJoined,
  currentUserId,
}: {
  meetingId: string;
  requestCount: number;
  writing: WallPerson[];
  notJoined: WallPerson[];
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, assign, pending] = useActionState(assignPrayersAction.bind(null, meetingId), initialState);

  // The server refuses both regardless; this just doesn't offer the button.
  if (requestCount < 2) {
    return <p className="text-muted-foreground text-center text-[12.5px]">Prayers can be assigned once two requests are in.</p>;
  }
  if (writing.length > 0) {
    return (
      <p className="text-muted-foreground text-center text-[12.5px]">
        {waitingCaption(writing, currentUserId)}
      </p>
    );
  }

  const callout = notJoinedCallout(notJoined, currentUserId);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button size="block" />}>Assign prayers</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign prayers?</DialogTitle>
            <DialogDescription>
              {`${requestCount} requests are on the wall. Everyone who posted gets one to pray for this week, never their own.`}
            </DialogDescription>
          </DialogHeader>
          {callout && (
            <p className="bg-surface-tint text-strong rounded-chip px-3.5 py-3 text-[13.5px] leading-normal">
              {callout}
            </p>
          )}
          <p className="text-muted-foreground text-[13.5px]">
            The wall locks once prayers are assigned. Nothing can be edited afterwards.
          </p>
          {state.error && <p className="text-destructive text-xs">{state.error}</p>}
          <DialogFooter className="flex-col sm:flex-row">
            <DialogClose render={<Button variant="outline" type="button" autoFocus />}>Cancel</DialogClose>
            <Button type="button" disabled={pending} onClick={() => startTransition(() => assign(new FormData()))}>
              {pending ? "Assigning…" : "Assign prayers"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p className="text-muted-foreground -mt-1.5 text-center text-[12.5px]">
        {`${requestCount} people posted · you'll each get one to pray for`}
      </p>
    </>
  );
}
