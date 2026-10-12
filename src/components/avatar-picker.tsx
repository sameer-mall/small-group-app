"use client";

import { startTransition, useActionState, useRef, useState, type ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import { CropDialog } from "@/components/crop-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/app/(app)/group/actions";
import { removeAvatarAction, updateAvatarAction } from "@/app/(app)/settings/actions";

const initialState: ActionState = { error: null, success: false };

// Refused before the file is even read: the cropper decodes the whole photo
// in memory, and nothing a phone takes is this big.
const MAX_PICK_BYTES = 20 * 1024 * 1024;

// The member's own photo, with the controls to change it. Choosing a file
// opens the crop dialog; confirming the crop uploads straight away, and the
// action revalidates both screens, so the server re-renders with the new
// photo and nothing here has to remember it. `enabled` is false when photos
// are off (Vercel without a Blob store): the photo still shows, the buttons
// don't.
//
// Two layouts. "inline" (Welcome): a round avatar with the buttons beside
// it. "card" (Settings): the photo fills the top of the card edge to edge,
// and a white panel rises into it with a shallow arc, holding `children`
// (the name row) and then the buttons. The arc is one circular curve across
// the panel's width: a 948px circle whose top sits ARC_RISE px below the
// photo's bottom edge, so at a phone's card width it rises about 32px in the
// middle and is still sloping gently where it meets the sides.
export function AvatarPicker({
  name,
  image,
  enabled,
  layout = "inline",
  children,
}: {
  name: string;
  image: string | null;
  enabled: boolean;
  layout?: "inline" | "card";
  children?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // An object URL for the photo being framed. Created and revoked in event
  // handlers, so there is nothing for an effect to clean up.
  const [src, setSrc] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [saveState, save, saving] = useActionState(updateAvatarAction, initialState);
  const [removeState, remove, removing] = useActionState(removeAvatarAction, initialState);

  // The newest message wins. A picker error (too large, unreadable) is set
  // here; an action's error arrives in its state. When an action settles, any
  // picker error is stale, so drop it. Adjusted during render, the same
  // pattern as profile-card.tsx.
  const [seen, setSeen] = useState({ save: saveState, remove: removeState });
  if (seen.save !== saveState || seen.remove !== removeState) {
    setSeen({ save: saveState, remove: removeState });
    setLocalError(null);
  }
  const error = localError ?? saveState.error ?? removeState.error;
  const busy = saving || removing;

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    e.target.value = "";
    if (!picked) return;
    if (picked.size > MAX_PICK_BYTES) {
      setLocalError("That photo is too large. Pick one under 20 MB.");
      return;
    }
    setLocalError(null);
    setSrc(URL.createObjectURL(picked));
  }

  function closeCropper() {
    if (src) URL.revokeObjectURL(src);
    setSrc(null);
  }

  function onCrop(photo: Blob) {
    closeCropper();
    const formData = new FormData();
    formData.append("photo", photo, "avatar.jpg");
    startTransition(() => save(formData));
  }

  function onUnreadable() {
    closeCropper();
    setLocalError("That photo couldn't be read. Try a JPEG or PNG.");
  }

  const buttons = enabled && (
    <div className={cn("flex gap-2", layout === "inline" ? "flex-wrap" : "[&>*]:flex-1")}>
      <Button
        type="button"
        variant="secondary"
        size="pill"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {image ? "Change photo" : "Add a photo"}
      </Button>
      {image && (
        <Button
          type="button"
          variant="outline"
          size="pill"
          disabled={busy}
          onClick={() => startTransition(() => remove(new FormData()))}
        >
          Remove photo
        </Button>
      )}
    </div>
  );

  const hidden = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Choose a photo"
        onChange={onPick}
      />
      <CropDialog src={src} onCancel={closeCropper} onCrop={onCrop} onUnreadable={onUnreadable} />
    </>
  );

  if (layout === "card") {
    return (
      <>
        {/* With a photo, a tall cover; without one, a shorter block of the
            initials in the avatar colours, so the card still opens with the
            member rather than a blank. */}
        <Avatar
          name={name}
          image={image}
          className={cn(
            "w-full rounded-none text-4xl",
            image ? "h-[300px]" : "h-44",
            busy && "opacity-50",
          )}
        />
        <div className="relative isolate -mt-8 flex flex-col gap-3.5 px-5 pt-[42px] pb-5 before:absolute before:top-0 before:left-1/2 before:-z-10 before:size-[948px] before:-translate-x-1/2 before:rounded-full before:bg-card before:content-['']">
          {children}
          {buttons}
          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>
        {hidden}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Avatar name={name} image={image} className={cn("size-16 text-lg", busy && "opacity-50")} />
        {buttons}
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
      {hidden}
    </div>
  );
}
