"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateDisplayNameAction, type ActionState } from "@/app/(app)/group/actions";

const initialState: ActionState = { error: null, success: false };

// The one place a member sees their own name the way the group sees it (the
// member list shows them as "You"). The email sits beneath it since it's the
// account identity, kept distinct from the name people actually read.
export function DisplayNameCard({ name, email }: { name: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(updateDisplayNameAction, initialState);

  // Close the dialog the moment a submit succeeds — adjusted during render
  // rather than in an effect, the same pattern as meeting-actions-menu.tsx.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) setOpen(false);
  }

  return (
    <div className="bg-card rounded-card shadow-card flex items-center justify-between gap-3 p-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-muted-foreground tracking-label text-xs uppercase">You</p>
        <p className="text-strong truncate font-medium">{name}</p>
        <p className="text-tertiary truncate text-xs">{email}</p>
      </div>
      <Button type="button" variant="secondary" size="pill" onClick={() => setOpen(true)}>
        Edit name
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif text-xl font-semibold">Edit your name</DialogTitle>
            <DialogDescription>
              This is how your name shows on meal claims, prayers, and the member list.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-3">
            <input
              name="name"
              defaultValue={name}
              placeholder="Sam Miller"
              required
              maxLength={60}
              autoComplete="name"
              enterKeyHint="done"
              className="bg-card border-border focus:border-primary rounded-input min-h-tap w-full border-[1.5px] px-4 py-3.5 text-[16px] outline-none"
            />
            {state.error && <p className="text-destructive text-xs">{state.error}</p>}
            <Button type="submit" size="block">
              Save
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
