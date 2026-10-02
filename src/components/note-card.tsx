"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createAutosaver, type SaveStatus } from "@/lib/autosave";
import { cn } from "@/lib/utils";

const STATUS_COPY: Record<SaveStatus, string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved just now",
  error: "Not saved yet",
};

export function NoteCard({
  initialBody,
  save,
  emptyStatus,
}: {
  initialBody: string;
  // A server action bound to what it saves (the meeting page binds
  // saveNoteAction to the meeting), passed down by the page.
  save: (body: string) => Promise<{ saved: boolean }>;
  // Shown instead of the save status while the field is blank, where a blank
  // note isn't saved (Task 4's page).
  emptyStatus?: string;
}) {
  const [body, setBody] = useState(initialBody);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [focused, setFocused] = useState(false);
  // Created once per card. A save that returns { saved: false } or throws
  // (offline) rejects, which the autosaver reports and retries.
  const [saver] = useState(() =>
    createAutosaver({
      delayMs: 1000,
      onStatus: setStatus,
      save: async (value) => {
        const { saved } = await save(value);
        if (!saved) throw new Error("not saved");
      },
    }),
  );

  // The page re-renders under this card — on focus, from the prayer bowl's
  // polling, and after each save's own revalidation — and each render may
  // bring a different server value. It replaces the field only while the
  // field isn't focused and nothing is unsaved: that is how an edit made on
  // another device shows up, without ever stealing keystrokes. Adjusted
  // during render rather than in an effect, as in open-prayer-bowl.tsx.
  const [seenInitial, setSeenInitial] = useState(initialBody);
  if (initialBody !== seenInitial) {
    setSeenInitial(initialBody);
    if (!focused && !saver.hasUnsaved()) setBody(initialBody);
  }

  // Phones background apps constantly, and leaving the page unmounts the
  // card: save whatever is waiting at both moments, not a second later.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void saver.flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      void saver.flush();
    };
  }, [saver]);

  const blankHere = emptyStatus !== undefined && body.trim() === "";

  return (
    <section className="bg-card rounded-card shadow-card flex flex-col gap-2.5 p-[18px]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-[19px] font-semibold">My note</h2>
        <span
          role="status"
          className={cn(
            "text-xs",
            status === "error" && !blankHere ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {blankHere ? emptyStatus : STATUS_COPY[status]}
        </span>
      </div>
      <textarea
        aria-label="My note"
        placeholder="Tap to start a private note…"
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
          saver.schedule(event.target.value);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          void saver.flush();
        }}
        // Mirrors the action's MAX_NOTE_LENGTH (a client file can't import
        // the server's constant without pulling the database into the bundle).
        maxLength={10000}
        rows={3}
        // ≥16px stops iOS zooming on focus (parent spec, Mobile-first); the
        // mockup's 15px yields to that rule. field-sizing grows the field with
        // its content where supported; min-h keeps a tappable area elsewhere.
        // scroll-mb keeps it clear of the fixed tab bar when the keyboard
        // scrolls it into view.
        className="text-prayer placeholder:text-tertiary field-sizing-content min-h-[72px] w-full resize-none scroll-mb-28 bg-transparent text-[16px] leading-[1.55] break-words outline-none"
      />
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-tertiary">{body.trim() ? "Only you can see this" : ""}</span>
        <Link
          href="/notes"
          className="text-accent-strong min-h-tap inline-flex shrink-0 items-center font-semibold"
        >
          See all my notes ›
        </Link>
      </div>
    </section>
  );
}
