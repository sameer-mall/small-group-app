"use client";

import { useState } from "react";
import { UserRoundIcon } from "lucide-react";
import { largeGooglePhoto } from "@/lib/google-photo";
import { cn, initials } from "@/lib/utils";

// One member's avatar: their photo when they have one, initials otherwise,
// and initials again if the photo fails to load (an expired Google URL). The
// only place avatar markup lives; size with className (size-8 text-xs is the
// row default).
export function Avatar({
  name,
  image,
  className,
}: {
  name: string;
  image: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = image !== null && failed !== image;
  const label = initials(name);

  return (
    <div
      className={cn(
        "bg-avatar text-avatar-foreground flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold",
        className,
      )}
    >
      {showImage ? (
        // The name is always beside the avatar, so the image is decorative.
        // A plain <img>: one fixed-size file from a CDN, which next/image
        // would only re-encode on every render. largeGooglePhoto also fixes
        // accounts saved before sign-in started asking Google for a big copy.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={largeGooglePhoto(image)}
          alt=""
          referrerPolicy="no-referrer"
          draggable={false}
          className="size-full object-cover"
          onError={() => setFailed(image)}
        />
      ) : label === "?" ? (
        <UserRoundIcon className="size-1/2" aria-hidden />
      ) : (
        label
      )}
    </div>
  );
}
