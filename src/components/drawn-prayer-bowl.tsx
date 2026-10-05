import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import type { PrayerBowl } from "@/lib/prayers";

export function DrawnPrayerBowl({ drawn }: { drawn: PrayerBowl["drawn"] }) {
  if (!drawn) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-muted-foreground text-[14.5px]">
          The bowl has been drawn. You didn&apos;t put a request in this time.
        </p>
        <Link
          href="/prayers"
          className={buttonVariants({ variant: "secondary", size: "pill" })}
        >
          See all my prayers ›
        </Link>
      </div>
    );
  }

  return (
    <>
      <p className="text-tertiary text-center text-[12.5px] font-bold tracking-[0.1em] uppercase">
        You drew
      </p>
      {/* The request is the whole point of the screen: it wraps, never truncates. */}
      <blockquote className="text-prayer px-1.5 text-center font-serif text-[20px] leading-[1.6] break-words whitespace-pre-line">
        &quot;{drawn.body}&quot;
      </blockquote>
      {drawn.authorName ? (
        <p className="text-muted-foreground text-center text-[14.5px]">From {drawn.authorName}</p>
      ) : (
        <p className="text-tertiary text-center text-[14.5px] italic">Name not shared</p>
      )}
      <div className="bg-divider h-px" />
      <div className="flex flex-col items-center text-center text-[13px] leading-normal">
        <p className="text-muted-foreground">Carry this with you through the week.</p>
        <Link
          href="/prayers"
          className={buttonVariants({ variant: "secondary", size: "pill" })}
        >
          See all my prayers ›
        </Link>
      </div>
    </>
  );
}
