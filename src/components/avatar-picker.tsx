"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { CropDialog } from "@/components/crop-dialog";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/app/(app)/group/actions";
import { removeAvatarAction, updateAvatarAction } from "@/app/(app)/settings/actions";

const initialState: ActionState = { error: null, success: false };

// Refused before the file is even read: the cropper decodes the whole photo
// in memory, and nothing a phone takes is this big.
const MAX_PICK_BYTES = 20 * 1024 * 1024;

// The member's own photo, with the controls to change it. Used on Welcome and
// on the Settings profile card. Choosing a file opens the crop dialog;
// confirming the crop uploads straight away, and the action revalidates both
// screens, so the server re-renders with the new photo and nothing here has
// to remember it. `enabled` is false when photos are off (Vercel without a
// Blob store): the avatar still shows, the buttons don't.
export function AvatarPicker({
  name,
  image,
  enabled,
}: {
  name: string;
  image: string | null;
  enabled: boolean;
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
  // pattern as display-name-card.tsx.
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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Avatar
          name={name}
          image={image}
          className={busy ? "size-16 text-lg opacity-50" : "size-16 text-lg"}
        />
        {enabled && (
          <div className="flex flex-wrap gap-2">
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
        )}
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Choose a photo"
        onChange={onPick}
      />
      <CropDialog src={src} onCancel={closeCropper} onCrop={onCrop} onUnreadable={onUnreadable} />
    </div>
  );
}
