"use client";

import { startTransition, useActionState } from "react";
import { initials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  approveRequestAction,
  denyRequestAction,
  type ActionState,
} from "@/app/(app)/group/actions";

const initialState: ActionState = { error: null, success: false };

export type PendingRequest = {
  id: string;
  name: string;
  email: string;
};

export function PendingRequestRow({ request }: { request: PendingRequest }) {
  const [approveState, approveAction] = useActionState(
    approveRequestAction.bind(null, request.id),
    initialState,
  );
  const [denyState, denyAction] = useActionState(
    denyRequestAction.bind(null, request.id),
    initialState,
  );

  const error = approveState.error ?? denyState.error;

  return (
    <div
      className="bg-warning-surface border-warning-border rounded-chip flex flex-col gap-2 border p-4"
      data-testid="pending-request-row"
    >
      <div className="flex items-center gap-2.5">
        <div className="bg-avatar text-avatar-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold">
          {initials(request.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">{request.name} wants to join</p>
          <p className="text-muted-foreground truncate text-xs">{request.email}</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            className="bg-success rounded-full px-3.5 py-1.5 text-sm font-bold text-white"
            onClick={() => startTransition(() => approveAction(new FormData()))}
          >
            Approve
          </button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-full"
            onClick={() => startTransition(() => denyAction(new FormData()))}
          >
            Deny
          </Button>
        </div>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
