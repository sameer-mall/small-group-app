"use client";

import { startTransition, useActionState, useOptimistic, useState } from "react";
import {
  deletePrayerRequestAction,
  joinPrayerWallAction,
  leavePrayerWallAction,
  postPrayerRequestAction,
  type ActionState,
} from "@/app/(app)/prayers/actions";
import type { PrayerWall as Wall, WallPerson } from "@/lib/prayers";
import { Button } from "@/components/ui/button";
import { AssignPrayersButton } from "@/components/assign-prayers-button";
import { displayNames, PrayerBuckets } from "@/components/prayer-buckets";

const initialState: ActionState = { error: null, success: false };

// The viewer's place on an open wall.
type Stage = "not-in" | "writing" | "posted";

function stageOf(wall: Wall): Stage {
  return wall.mine ? "posted" : wall.viewerJoined ? "writing" : "not-in";
}

// Puts the viewer in the bucket matching their (possibly optimistic) stage,
// so the lists agree with the screen before the server has answered. Once
// posted, the viewer is in neither: their request is on the wall instead.
function placeViewer(wall: Wall, stage: Stage, viewerId: string) {
  const isViewer = (m: WallPerson) => m.userId === viewerId;
  const isOther = (m: WallPerson) => !isViewer(m);
  const me = [...wall.writing, ...wall.notJoined].find(isViewer) ?? { userId: viewerId, name: "You" };
  const buckets = {
    writing: wall.writing.filter(isOther),
    notJoined: wall.notJoined.filter(isOther),
  };
  if (stage === "writing") buckets.writing.unshift(me);
  if (stage === "not-in") buckets.notJoined.unshift(me);
  return buckets;
}

function PostForm({
  initialBody = "",
  editing,
  error,
  onSubmit,
  onDelete,
  onLeave,
}: {
  initialBody?: string;
  editing: boolean;
  error: string | null;
  onSubmit: (formData: FormData) => void;
  onDelete: () => void;
  onLeave: () => void;
}) {
  const [body, setBody] = useState(initialBody);

  return (
    <form action={onSubmit} className="flex flex-col gap-2.5">
      <label htmlFor="prayer-request-body" className="text-[14.5px] font-semibold">
        Share a request
      </label>
      <textarea
        id="prayer-request-body"
        name="body"
        placeholder="What can we pray for?"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        // required + maxLength mirror the action's checks, so the optimistic
        // flip in PrayerWall never fires for a request the server would
        // refuse on validation grounds.
        required
        maxLength={1000}
        rows={4}
        // ≥16px stops iOS zooming on focus (parent spec, Mobile-first); the
        // mockup's 15px yields to that rule. scroll-mb keeps the field clear
        // of the fixed tab bar when the keyboard scrolls it into view.
        className="bg-card border-border focus:border-primary rounded-input min-h-[84px] w-full scroll-mb-28 border-[1.5px] p-3.5 text-[16px] leading-[1.55] outline-none"
      />
      <p className="text-muted-foreground text-[12.5px]">
        Your name shows with it. Everyone in the group can see the wall.
      </p>
      {error && <p className="text-destructive text-xs">{error}</p>}
      <Button type="submit" size="block">
        {editing ? "Save" : "Post to the wall"}
      </Button>
      {editing ? (
        <Button type="button" variant="destructive" onClick={onDelete} className="self-center">
          Delete my request
        </Button>
      ) : (
        // Assigning waits for everyone who's in, so joining has to be
        // undoable or one stray "I'm in" would hold up the whole group.
        <Button type="button" variant="outline" onClick={onLeave} className="self-center">
          I&apos;m out
        </Button>
      )}
    </form>
  );
}

export function PrayerWall({
  wall,
  meetingId,
  currentUserId,
  children,
}: {
  wall: Wall;
  meetingId: string;
  currentUserId: string;
  children: React.ReactNode;
}) {
  const [joinState, join] = useActionState(joinPrayerWallAction.bind(null, meetingId), initialState);
  const [submitState, submit, submitPending] = useActionState(
    postPrayerRequestAction.bind(null, meetingId),
    initialState,
  );
  const [deleteState, remove] = useActionState(
    deletePrayerRequestAction.bind(null, meetingId),
    initialState,
  );
  const [leaveState, leave] = useActionState(
    leavePrayerWallAction.bind(null, meetingId),
    initialState,
  );

  // A tap moves the viewer's own stage at once; React drops the guess when
  // the transition settles, so a refused write snaps back by itself.
  const [stage, setStage] = useOptimistic(stageOf(wall), (_: Stage, next: Stage) => next);
  const [editing, setEditing] = useState(false);

  // Leave edit mode once an update or deletion lands, adjusted during render
  // rather than in an effect, as in new-meeting-sheet.tsx. Each state is
  // checked only when *it* just changed: a refused save must not be masked by
  // a stale deleteState.success (or vice versa), which would close edit mode
  // and hide the error shown inside the form.
  const [handled, setHandled] = useState({ submitState, deleteState });
  if (submitState !== handled.submitState || deleteState !== handled.deleteState) {
    const submitChanged = submitState !== handled.submitState;
    const deleteChanged = deleteState !== handled.deleteState;
    setHandled({ submitState, deleteState });
    if ((submitChanged && submitState.success) || (deleteChanged && deleteState.success)) {
      setEditing(false);
    }
  }

  const buckets = placeViewer(wall, stage, currentUserId);

  let stageBlock: React.ReactNode;
  if (stage === "writing" || editing) {
    stageBlock = (
      <PostForm
        key={editing ? "edit" : "new"}
        initialBody={editing ? wall.mine?.body : ""}
        editing={editing}
        error={submitState.error ?? deleteState.error ?? leaveState.error}
        // A form action already runs inside a transition, which is what lets
        // setStage here be an optimistic update.
        onSubmit={(formData) => {
          setStage("posted");
          submit(formData);
        }}
        onDelete={() =>
          startTransition(() => {
            setStage("writing");
            remove(new FormData());
          })
        }
        onLeave={() =>
          startTransition(() => {
            setStage("not-in");
            leave(new FormData());
          })
        }
      />
    );
  } else if (stage === "not-in") {
    stageBlock = (
      <div className="flex flex-col gap-2.5">
        <Button
          type="button"
          size="block"
          onClick={() =>
            startTransition(() => {
              setStage("writing");
              join(new FormData());
            })
          }
        >
          I&apos;m in
        </Button>
        <p className="text-muted-foreground text-center text-[12.5px]">
          Tap when you&apos;re ready to write one, so the group waits for you.
        </p>
        {joinState.error && <p className="text-destructive text-xs">{joinState.error}</p>}
      </div>
    );
  } else {
    // The request itself shows first in the feed below.
    stageBlock = (
      <Button
        type="button"
        variant="secondary"
        size="pill"
        disabled={submitPending}
        onClick={() => setEditing(true)}
        className="self-start"
      >
        Edit my request
      </Button>
    );
  }

  return (
    <>
      {stageBlock}
      <div className="bg-divider h-px" />
      {children}
      <PrayerBuckets {...buckets} currentUserId={currentUserId} />
      <AssignPrayersButton
        meetingId={meetingId}
        requestCount={wall.requests.length}
        writingNames={displayNames(buckets.writing, currentUserId)}
        notJoinedNames={displayNames(buckets.notJoined, currentUserId)}
      />
    </>
  );
}
