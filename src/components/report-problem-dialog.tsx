"use client";

import { useState } from "react";
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
import { sendProblemReport, startProblemReport } from "@/lib/problem-report";

// The report goes straight from the browser to Sentry. The cap only keeps one
// report to a readable length.
const MAX_REPORT_LENGTH = 2000;

export function ReportProblemDialog({
  label,
  look,
  getAssociatedEventId,
}: {
  label: string;
  // "inline" sits quietly on the Group tab; "block" is the error screen's
  // full-width second action, under "Try again".
  look: "inline" | "block";
  // The error screen passes the id of the error it just reported, so the
  // report shows up on that error in Sentry.
  getAssociatedEventId?: () => string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      startProblemReport();
    } else {
      setMessage("");
      setSent(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;
    sendProblemReport(trimmed, getAssociatedEventId?.());
    setSent(true);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          look === "inline" ? (
            <Button type="button" variant="secondary" />
          ) : (
            <Button type="button" variant="outline" size="block" />
          )
        }
      >
        {label}
      </DialogTrigger>
      <DialogContent>
        {sent ? (
          <>
            <DialogHeader>
              <DialogTitle>Thanks for letting us know</DialogTitle>
              <DialogDescription>Your report was sent.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button type="button" />}>Done</DialogClose>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Report a problem</DialogTitle>
              <DialogDescription>
                Tell us what you were trying to do and what went wrong. Your report also includes a
                recording of your screen, starting a minute before you opened this, with all text hidden.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="problem-report" className="text-strong text-sm font-medium">
                What happened?
              </label>
              <textarea
                id="problem-report"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={MAX_REPORT_LENGTH}
                rows={4}
                // ≥16px stops iOS zooming on focus (parent spec, Mobile-first).
                className="bg-background border-border focus:border-primary rounded-input w-full resize-none border-[1.5px] px-4 py-3 text-[16px] leading-[1.5] outline-none"
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
              <Button type="submit" disabled={!message.trim()}>
                Send report
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
