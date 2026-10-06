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
  DialogTrigger,
} from "@/components/ui/dialog";
import { drawPrayerBowlAction, type ActionState } from "@/app/(app)/prayers/actions";

const initialState: ActionState = { error: null, success: false };

export function DrawBowlButton({
  meetingId,
  submittedCount,
  waitingCount,
}: {
  meetingId: string;
  submittedCount: number;
  waitingCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, draw, pending] = useActionState(
    drawPrayerBowlAction.bind(null, meetingId),
    initialState,
  );

  // The server refuses both of these regardless; this just doesn't offer the
  // draw. The Waiting on row above already names who the bowl is waiting for.
  if (submittedCount < 2) {
    return (
      <p className="text-muted-foreground text-center text-[12.5px]">
        The bowl can be drawn once two requests are in.
      </p>
    );
  }
  if (waitingCount > 0) {
    return (
      <p className="text-muted-foreground text-center text-[12.5px]">
        The bowl can be drawn once everyone who&apos;s in has put a request in.
      </p>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button size="block" />}>
          Draw the bowl
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Draw the bowl?</DialogTitle>
            <DialogDescription>
              {submittedCount} requests are in. Each of you will draw one, never your own.
              Nothing can be changed afterwards.
            </DialogDescription>
          </DialogHeader>
          {state.error && <p className="text-destructive text-xs">{state.error}</p>}
          {/* Cancel takes focus and sits nearest the top; the draw — which
              can't be undone — is at the far end, clear of the tap that opened
              this. flex-col cancels DialogFooter's flex-col-reverse. */}
          <DialogFooter className="flex-col sm:flex-row">
            <DialogClose render={<Button variant="outline" type="button" autoFocus />}>
              Cancel
            </DialogClose>
            <Button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => draw(new FormData()))}
            >
              {pending ? "Drawing…" : "Draw the bowl"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Design doc, conflict 3: the count is the submitters — the people who
          will actually draw — not everyone who has joined. */}
      {/* One template-literal expression, not JSX text: an HTML entity
          (&apos;) in JSX text makes the compiler drop the space after the
          number, so the whole sentence is built as a plain string instead. */}
      <p className="text-muted-foreground -mt-1.5 text-center text-[12.5px]">
        {`${submittedCount} people in · you'll each draw one request`}
      </p>
    </>
  );
}
