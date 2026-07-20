"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { renameGroupAction, type ActionState } from "@/app/(app)/group/actions";

const initialState: ActionState = { error: null, success: false };

export function GroupNameHeader({
  groupId,
  name,
  isAdmin,
}: {
  groupId: string;
  name: string;
  isAdmin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState(
    renameGroupAction.bind(null, groupId),
    initialState,
  );

  // Close the editor the moment a submit succeeds — adjusted during render
  // (not in an effect) per https://react.dev/learn/you-might-not-need-an-effect
  // ("Adjusting some state when a prop changes").
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) setEditing(false);
  }

  // Renaming writes to the organization table directly (src/lib/groups.ts),
  // bypassing Better Auth's client SDK — so the organization-list nanostore
  // used by useListOrganizations() (e.g. GroupSwitcher) never hears about
  // it. Refetch explicitly after a successful rename so it doesn't go stale
  // for the rest of the browser session. This one *is* an effect: it's
  // synchronizing an external store, not adjusting local state.
  const { refetch } = authClient.useListOrganizations();
  useEffect(() => {
    if (state.success) refetch();
  }, [state, refetch]);

  if (!isAdmin) {
    return <h1 className="font-serif text-3xl font-semibold">{name}</h1>;
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-semibold">{name}</h1>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
          Rename
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <input
          name="name"
          defaultValue={name}
          required
          autoFocus
          className="bg-card border-border focus:border-primary rounded-input min-h-tap flex-1 border-[1.5px] px-3 py-2 text-lg font-semibold outline-none"
        />
        <Button type="submit" size="sm">
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
      {state.error && <p className="text-destructive text-xs">{state.error}</p>}
    </form>
  );
}
