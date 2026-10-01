"use client";

import { startTransition, useActionState, useOptimistic, useState } from "react";
import {
  joinPrayerBowlAction,
  submitPrayerRequestAction,
  withdrawPrayerRequestAction,
  type ActionState,
} from "@/app/(app)/prayers/actions";
import type { BowlMember, PrayerBowl } from "@/lib/prayers";
import { DrawBowlButton } from "@/components/draw-bowl-button";
import { PrayerBuckets } from "@/components/prayer-buckets";
import { PrayerCompose } from "@/components/prayer-compose";

const initialState: ActionState = { error: null, success: false };

// The viewer's place in an open bowl (design doc, decision 1).
type Stage = "not-joined" | "composing" | "submitted";

function stageOf(bowl: PrayerBowl): Stage {
  if (bowl.viewer.request) return "submitted";
  return bowl.viewer.joined ? "composing" : "not-joined";
}

// Puts the viewer in the bucket matching their (possibly optimistic) stage,
// so the lists agree with the screen before the server has answered.
function placeViewer(bowl: PrayerBowl, stage: Stage, viewerId: string) {
  const everyone = [...bowl.submitted, ...bowl.waiting, ...bowl.notJoined];
  const me: BowlMember = everyone.find((m) => m.userId === viewerId) ?? { userId: viewerId, name: "You" };
  const without = (list: BowlMember[]) => list.filter((m) => m.userId !== viewerId);
  return {
    submitted: stage === "submitted" ? [me, ...without(bowl.submitted)] : without(bowl.submitted),
    waiting: stage === "composing" ? [me, ...without(bowl.waiting)] : without(bowl.waiting),
    notJoined: stage === "not-joined" ? [me, ...without(bowl.notJoined)] : without(bowl.notJoined),
  };
}

export function OpenPrayerBowl({
  bowl,
  meetingId,
  currentUserId,
}: {
  bowl: PrayerBowl;
  meetingId: string;
  currentUserId: string;
}) {
  const [joinState, join] = useActionState(joinPrayerBowlAction.bind(null, meetingId), initialState);
  const [submitState, submit] = useActionState(
    submitPrayerRequestAction.bind(null, meetingId),
    initialState,
  );
  const [withdrawState, withdraw] = useActionState(
    withdrawPrayerRequestAction.bind(null, meetingId),
    initialState,
  );

  // A tap moves the viewer's own stage at once; React drops the guess when
  // the transition settles, so a refused write snaps back by itself.
  const [stage, setStage] = useOptimistic(stageOf(bowl), (_: Stage, next: Stage) => next);
  const [editing, setEditing] = useState(false);

  // Leave edit mode once an update or withdrawal lands — adjusted during
  // render rather than in an effect, as in new-meeting-sheet.tsx. Each state
  // is checked only when *it* just changed: a refused submit must not be
  // masked by a stale withdrawState.success (or vice versa), which would
  // close edit mode and hide the error shown inside the compose form.
  const [handled, setHandled] = useState({ submitState, withdrawState });
  if (submitState !== handled.submitState || withdrawState !== handled.withdrawState) {
    const submitChanged = submitState !== handled.submitState;
    const withdrawChanged = withdrawState !== handled.withdrawState;
    setHandled({ submitState, withdrawState });
    if ((submitChanged && submitState.success) || (withdrawChanged && withdrawState.success)) {
      setEditing(false);
    }
  }

  if (stage === "composing" || editing) {
    return (
      <PrayerCompose
        key={editing ? "edit" : "new"}
        initialBody={editing ? bowl.viewer.request?.body : ""}
        initialIncludeName={editing ? bowl.viewer.request?.includeName : false}
        editing={editing}
        error={submitState.error ?? withdrawState.error}
        // A form action already runs inside a transition, which is what lets
        // setStage here be an optimistic update.
        onSubmit={(formData) => {
          setStage("submitted");
          submit(formData);
        }}
        onWithdraw={() =>
          startTransition(() => {
            setStage("composing");
            withdraw(new FormData());
          })
        }
      />
    );
  }

  const buckets = placeViewer(bowl, stage, currentUserId);

  return (
    <div className="flex flex-col gap-3.5">
      <PrayerBuckets {...buckets} currentUserId={currentUserId} />
      {stage === "not-joined" ? (
        <button
          type="button"
          onClick={() =>
            startTransition(() => {
              setStage("composing");
              join(new FormData());
            })
          }
          className="bg-primary text-primary-foreground rounded-input min-h-tap w-full px-4 py-3.5 text-base font-bold"
        >
          I&apos;m in
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-accent-strong min-h-tap self-start text-sm font-semibold"
        >
          Edit my request
        </button>
      )}
      {joinState.error && <p className="text-destructive text-xs">{joinState.error}</p>}
      <DrawBowlButton
        meetingId={meetingId}
        submittedCount={buckets.submitted.length}
        stillWriting={buckets.waiting}
      />
    </div>
  );
}
