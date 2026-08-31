"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createMeetingAction, type ActionState } from "@/app/(app)/meetings/actions";

const initialState: ActionState = { error: null, success: false };

export function NewMeetingSheet({ groupId }: { groupId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(
    createMeetingAction.bind(null, groupId),
    initialState,
  );

  // Close the sheet the moment a submit succeeds — adjusted during render
  // (not in an effect) per https://react.dev/learn/you-might-not-need-an-effect
  // ("Adjusting some state when a prop changes"), same pattern as
  // src/components/group-name-header.tsx.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="bg-primary text-primary-foreground rounded-input min-h-tap flex w-full items-center justify-center px-4 py-3.5 text-base font-bold">
        Plan a meeting
      </DialogTrigger>
      <DialogContent className="fixed top-auto right-0 bottom-0 left-0 max-h-[85dvh] w-full max-w-full translate-x-0 translate-y-0 overflow-y-auto rounded-t-sheet rounded-b-none pb-[max(1.5rem,env(safe-area-inset-bottom))] duration-150 data-closed:slide-out-to-bottom data-open:slide-in-from-bottom sm:max-w-full">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl font-semibold">
            Plan a meeting
          </DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <input
            name="title"
            placeholder="Meeting title"
            required
            enterKeyHint="next"
            className="bg-card border-border focus:border-primary rounded-input min-h-tap w-full border-[1.5px] px-4 py-3.5 text-[16px] outline-none"
          />
          <input
            name="date"
            type="date"
            required
            className="bg-card border-border focus:border-primary rounded-input min-h-tap w-full border-[1.5px] px-4 py-3.5 text-[16px] outline-none"
          />
          {state.error && <p className="text-destructive text-xs">{state.error}</p>}
          <Button type="submit" size="lg" className="min-h-tap w-full font-bold">
            Create meeting
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
