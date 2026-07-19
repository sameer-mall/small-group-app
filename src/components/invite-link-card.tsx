"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
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
import { rotateInviteAction, type ActionState } from "@/app/(app)/group/actions";

const initialState: ActionState = { error: null, success: false };

export function InviteLinkCard({
  url,
  groupId,
  isAdmin,
}: {
  url: string;
  groupId: string;
  isAdmin: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [state, rotateAction] = useActionState(
    rotateInviteAction.bind(null, groupId),
    initialState,
  );

  // Close the confirm dialog the moment rotate succeeds — adjusted during
  // render (not in an effect) per
  // https://react.dev/learn/you-might-not-need-an-effect
  // ("Adjusting some state when a prop changes").
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) setRotateOpen(false);
  }

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  return (
    <div className="bg-card rounded-card shadow-card flex flex-col gap-2.5 p-4">
      <p className="text-muted-foreground tracking-label text-xs uppercase">Invite link</p>
      <div className="flex items-center gap-2">
        <p
          data-testid="invite-url"
          className="bg-surface-tint text-strong flex-1 overflow-hidden rounded-[10px] px-3 py-2.5 font-mono text-xs text-ellipsis whitespace-nowrap"
        >
          {url}
        </p>
        <Button type="button" onClick={handleCopy} className="min-h-tap shrink-0 rounded-[10px] px-3.5 font-bold">
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Anyone with this link can request to join.
        {isAdmin && (
          <Dialog open={rotateOpen} onOpenChange={setRotateOpen}>
            <DialogTrigger className="text-accent-strong ml-1 font-semibold">
              Rotate link
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Rotate invite link</DialogTitle>
                <DialogDescription>
                  New link invalidates the old one for new joiners. Members and pending requests
                  keep their access.
                </DialogDescription>
              </DialogHeader>
              {state.error && <p className="text-destructive text-xs">{state.error}</p>}
              <DialogFooter>
                <DialogClose render={<Button variant="outline" type="button" />}>
                  Cancel
                </DialogClose>
                <Button
                  type="button"
                  onClick={() => startTransition(() => rotateAction(new FormData()))}
                >
                  Rotate link
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </p>
    </div>
  );
}
