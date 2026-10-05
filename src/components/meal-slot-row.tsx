"use client";

import { startTransition, useActionState, useOptimistic, useState } from "react";
import { XIcon } from "lucide-react";
import { initials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  claimItemAction,
  releaseItemAction,
  removeAdhocItemAction,
  type ActionState,
} from "@/app/(app)/meals/actions";
import type { MealPlanItem } from "@/lib/meals";

const initialState: ActionState = { error: null, success: false };

type Claim = { by: string | null; name: string | null };

export function MealSlotRow({
  item,
  meetingId,
  currentUserId,
  isAdmin,
}: {
  item: MealPlanItem;
  meetingId: string;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [claimState, claim] = useActionState(
    claimItemAction.bind(null, meetingId, item.id),
    initialState,
  );
  const [releaseState, release] = useActionState(
    releaseItemAction.bind(null, meetingId, item.id),
    initialState,
  );
  const [removeState, remove] = useActionState(
    removeAdhocItemAction.bind(null, meetingId, item.id),
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
  const failed = claimState.error
    ? claimState
    : releaseState.error
      ? releaseState
      : removeState.error
        ? removeState
        : null;
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

  // Ad-hoc rows only, for whoever added it or a group admin, and only while
  // nobody holds it — removing a claimed item would yank a commitment out from
  // under the person who made it. The domain enforces all three regardless of
  // what this renders.
  const canRemove =
    item.source === "adhoc" &&
    !claimed &&
    (item.addedBy === currentUserId || isAdmin);

  return (
    <div className="border-divider flex flex-col border-b last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
        {claimed ? (
          <div className="bg-avatar text-avatar-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold">
            {mine ? "You" : initials(optimistic.name ?? "?")}
          </div>
        ) : (
          <div className="border-slot-dashed size-9 shrink-0 rounded-full border-[1.5px] border-dashed" />
        )}

        {/* Labels wrap rather than truncate — "3 bags of tortilla chips" is
            the whole point of the row and must stay readable. The label never
            narrows past 7rem (where words start breaking mid-letter); on a
            narrow phone the actions wrap onto their own line instead. */}
        <div className="flex min-w-28 flex-1 flex-col">
          <span className="text-[15px] break-words">{item.label}</span>
          {item.source === "adhoc" && item.addedByName && (
            <span className="text-tertiary text-xs">added by {item.addedByName}</span>
          )}
        </div>

        <div className="min-h-tap ml-auto flex shrink-0 items-center gap-1.5">
          {!claimed && (
            <Button type="button" size="pill" onClick={onClaim}>
              Claim
            </Button>
          )}
          {claimed && mine && (
            <Button type="button" variant="secondary" size="pill" onClick={onRelease}>
              Release
            </Button>
          )}
          {claimed && !mine && (
            <span className="text-muted-foreground text-sm">{optimistic.name}</span>
          )}
          {canRemove && (
            <Button
              type="button"
              variant="neutral"
              size="icon"
              onClick={() => startTransition(() => remove(new FormData()))}
              aria-label={`Remove ${item.label}`}
            >
              <XIcon />
            </Button>
          )}
        </div>
      </div>
      {error && <p className="text-destructive pb-2 text-xs">{error}</p>}
    </div>
  );
}
