"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { markWhatsNewSeenAction } from "@/app/(app)/group/actions";
import type { Release } from "@/lib/whats-new";
import { formatMeetingDate } from "@/lib/utils";

// The once-per-release popup, mounted by the (app) layout on every page.
// `releases` is what the member hasn't seen yet (newest first, already cut to
// the popup's limit), `newestId` the highest of them, 0 when there's nothing.
export function WhatsNewDialog({
  releases,
  newestId,
  hasMore,
}: {
  releases: Release[];
  newestId: number;
  hasMore: boolean;
}) {
  // The layout persists across client navigation, and a focus refresh can
  // hand this the same list again before the save lands. So it stays shut
  // once this id is dismissed, and only a newer release (a deploy while the
  // app is open) opens it again.
  const [dismissedThrough, setDismissedThrough] = useState(0);
  const open = releases.length > 0 && newestId > dismissedThrough;

  // Every way out counts as seen: Got it, See all updates, the X, a tap
  // outside, Escape. The save runs behind the closed dialog; if it fails, the
  // popup shows again next time, which is all a member needs.
  function dismiss() {
    setDismissedThrough(newestId);
    markWhatsNewSeenAction(newestId).catch(() => {});
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif text-xl font-semibold">What&apos;s new</DialogTitle>
          <DialogDescription>Here&apos;s what changed since you last looked.</DialogDescription>
        </DialogHeader>
        <ul className="divide-border flex flex-col divide-y">
          {releases.map((release) => (
            <li key={release.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-strong min-w-0 font-semibold break-words">
                  {release.title}
                </span>
                <span className="text-tertiary shrink-0 text-xs">
                  {formatMeetingDate(release.date, { month: "short", day: "numeric" })}
                </span>
              </div>
              <p className="text-muted-foreground text-sm leading-normal">{release.body}</p>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2">
          {hasMore && (
            <Link
              href="/settings/whats-new"
              onClick={dismiss}
              className={buttonVariants({ variant: "outline", size: "block" })}
            >
              See all updates
            </Link>
          )}
          <Button type="button" size="block" onClick={dismiss}>
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
