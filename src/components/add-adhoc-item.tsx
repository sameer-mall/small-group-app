"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { addAdhocItemAction, type ActionState } from "@/app/(app)/meals/actions";

const initialState: ActionState = { error: null, success: false };

export function AddAdhocItem({ meetingId }: { meetingId: string }) {
  const [label, setLabel] = useState("");
  const [state, formAction] = useActionState(
    addAdhocItemAction.bind(null, meetingId),
    initialState,
  );

  // Clear the field once the item lands, so the next "and also…" can be typed
  // straight away. The input is controlled rather than reset through a ref:
  // refs cannot be touched during render, and this adjustment happens during
  // render (the same pattern as new-meeting-sheet.tsx).
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.success) setLabel("");
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label
        htmlFor="adhoc-label"
        className="text-tertiary tracking-label text-xs font-bold uppercase"
      >
        Bringing something else?
      </label>
      <div className="flex items-center gap-2">
        <input
          id="adhoc-label"
          name="label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Brownies"
          enterKeyHint="done"
          className="bg-card border-border focus:border-primary rounded-input min-h-tap w-full flex-1 border-[1.5px] px-4 py-3.5 text-[16px] outline-none"
        />
        <Button type="submit" variant="secondary">
          Add item
        </Button>
      </div>
      {state.error && <p className="text-destructive text-xs">{state.error}</p>}
    </form>
  );
}
