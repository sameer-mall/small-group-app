"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

export function PrayerCompose({
  initialBody = "",
  initialIncludeName = false,
  editing,
  error,
  onSubmit,
  onWithdraw,
}: {
  initialBody?: string;
  initialIncludeName?: boolean;
  editing: boolean;
  error: string | null;
  onSubmit: (formData: FormData) => void;
  onWithdraw: () => void;
}) {
  const [body, setBody] = useState(initialBody);
  const [includeName, setIncludeName] = useState(initialIncludeName);
  const toggleLabelId = useId();

  return (
    <form action={onSubmit} className="flex flex-col gap-3.5">
      <p className="text-muted-foreground text-[14.5px] leading-normal">
        The bowl is open. Write a request. It stays sealed until everyone draws.
      </p>
      <textarea
        name="body"
        aria-label="Your prayer request"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        // required + maxLength mirror the action's checks, so the optimistic
        // flip in OpenPrayerBowl never fires for a request the server would
        // refuse on validation grounds.
        required
        maxLength={1000}
        rows={4}
        // ≥16px stops iOS zooming on focus (parent spec, Mobile-first); the
        // mockup's 15px yields to that rule. scroll-mb keeps the field clear
        // of the fixed tab bar when the keyboard scrolls it into view.
        className="bg-card border-border focus:border-primary rounded-input min-h-[84px] w-full scroll-mb-28 border-[1.5px] p-3.5 text-[16px] leading-[1.55] outline-none"
      />
      <div className="flex items-center justify-between gap-3">
        <span id={toggleLabelId} className="text-strong text-[14.5px] font-semibold">
          Include my name
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={includeName}
          aria-labelledby={toggleLabelId}
          onClick={() => setIncludeName((on) => !on)}
          className="min-h-tap flex shrink-0 items-center"
        >
          <span
            className={cn(
              "relative h-7 w-12 rounded-full transition-colors",
              includeName ? "bg-primary" : "bg-border",
            )}
          >
            <span
              className={cn(
                "bg-primary-foreground absolute top-[3px] size-[22px] rounded-full transition-all",
                includeName ? "right-[3px]" : "left-[3px]",
              )}
            />
          </span>
        </button>
        {/* A switch is not a form control, so its value rides along here. */}
        {includeName && <input type="hidden" name="includeName" value="on" />}
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
      <button
        type="submit"
        className="bg-primary text-primary-foreground rounded-input min-h-tap w-full px-4 py-3.5 text-base font-bold"
      >
        {editing ? "Update my request" : "Put it in the bowl"}
      </button>
      {editing ? (
        <button
          type="button"
          onClick={onWithdraw}
          className="text-destructive min-h-tap self-center text-sm font-semibold"
        >
          Take it out of the bowl
        </button>
      ) : (
        <p className="text-muted-foreground text-center text-[12.5px]">
          You can edit or remove it until the draw
        </p>
      )}
    </form>
  );
}
