"use client";

import { startTransition, useActionState, useOptimistic, useState } from "react";
import { initials } from "@/lib/utils";
import {
  claimItemAction,
  releaseItemAction,
  type ActionState,
} from "@/app/(app)/meals/actions";
import type { MealPlanItem } from "@/lib/meals";

const initialState: ActionState = { error: null, success: false };

type Claim = { by: string | null; name: string | null };

export function MealSlotRow({
  item,
  meetingId,
  currentUserId,
}: {
  item: MealPlanItem;
  meetingId: string;
  currentUserId: string;
}) {
  const [claimState, claim] = useActionState(
    claimItemAction.bind(null, meetingId, item.id),
    initialState,
  );
  const [releaseState, release] = useActionState(
    releaseItemAction.bind(null, meetingId, item.id),
    initialState,
  );

  // The server's view of who holds this slot. useOptimistic lets a tap paint
  // the new state immediately and React discards the guess once the transition
  // settles — so a failed claim snaps back to the truth on its own, without
  // this component tracking a rollback.
  const truth: Claim = { by: item.claimedBy, name: item.claimedByName };
  const [optimistic, setOptimistic] = useOptimistic(truth, (_, next: Claim) => next);

  // An inline error explains one failed attempt, so it should not outlive the
  // state that caused it. Once the server's view of this slot changes — a
  // focus refresh bringing in the claim that beat us, say — the row already
  // shows who holds it and the message is just noise. Adjusted during render
  // rather than in an effect, the same pattern as new-meeting-sheet.tsx.
  const failed = claimState.error ? claimState : releaseState.error ? releaseState : null;
  const [errorContext, setErrorContext] = useState<{
    state: ActionState | null;
    truthBy: string | null;
  }>({ state: null, truthBy: null });
  if (failed !== errorContext.state) {
    setErrorContext({ state: failed, truthBy: truth.by });
  }
  const error = failed && errorContext.truthBy === truth.by ? failed.error : null;

  const claimed = optimistic.by !== null;
  const mine = optimistic.by === currentUserId;

  // setOptimistic must run inside the transition, otherwise React has no
  // transition to attach the guess to and discards it immediately.
  function onClaim() {
    startTransition(() => {
      setOptimistic({ by: currentUserId, name: "You" });
      claim(new FormData());
    });
  }

  function onRelease() {
    startTransition(() => {
      setOptimistic({ by: null, name: null });
      release(new FormData());
    });
  }

  return (
    <div className="border-divider flex flex-col border-b last:border-b-0">
      <div className="flex items-center gap-3 py-3">
        {claimed ? (
          <div className="bg-avatar text-avatar-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold">
            {mine ? "You" : initials(optimistic.name ?? "?")}
          </div>
        ) : (
          <div className="border-slot-dashed size-9 shrink-0 rounded-full border-[1.5px] border-dashed" />
        )}

        {/* Labels wrap rather than truncate — "3 bags of tortilla chips" is
            the whole point of the row and must stay readable. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] break-words">{item.label}</span>
          {item.source === "adhoc" && item.addedByName && (
            <span className="text-tertiary text-xs">added by {item.addedByName}</span>
          )}
        </div>

        {!claimed && (
          <div className="min-h-tap flex shrink-0 items-center">
            <button
              type="button"
              onClick={onClaim}
              className="bg-primary text-primary-foreground rounded-full px-3.5 py-1.5 text-sm font-bold"
            >
              Claim
            </button>
          </div>
        )}
        {claimed && mine && (
          <div className="min-h-tap flex shrink-0 items-center">
            <button
              type="button"
              onClick={onRelease}
              className="text-accent-strong text-sm font-semibold"
            >
              Release
            </button>
          </div>
        )}
        {claimed && !mine && (
          <span className="text-muted-foreground shrink-0 text-sm">{optimistic.name}</span>
        )}
      </div>
      {error && <p className="text-destructive pb-2 text-xs">{error}</p>}
    </div>
  );
}
