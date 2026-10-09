"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { SettingsLink } from "@/components/settings-link";
import { cn } from "@/lib/utils";
import { backTarget, nextJourney } from "@/lib/journey";

// Above every signed-in screen: the settings gear on the four tab screens, a
// Back pill on every other one (src/lib/journey.ts decides where it goes). It
// sits in the (app) layout, which stays mounted from screen to screen, so the
// journey it keeps outlasts each page.
export function TopBar() {
  const pathname = usePathname();
  const [journey, setJourney] = useState(() => [pathname]);

  // Follows the pathname during render, not in an effect, so the new screen's
  // first paint already has the right Back. Per
  // https://react.dev/learn/you-might-not-need-an-effect ("Adjusting some
  // state when a prop changes").
  if (journey.at(-1) !== pathname) {
    setJourney(nextJourney(journey, pathname));
  }

  const back = backTarget(journey);

  return (
    // A slim row: the page's own top padding sits below it, so the negative
    // margin keeps the title from drifting far down the screen.
    <header
      className={cn("-mb-3 flex h-11 items-center px-6 pt-2", back ? "justify-start" : "justify-end")}
    >
      {back ? (
        <Link
          href={back.href}
          // "Back to Recipes", so it never reads as the Recipes tab itself.
          aria-label={back.label === "Back" ? "Back" : `Back to ${back.label}`}
          // Thinner than a pill; the pill's ::after still makes the hit area 44px.
          className={cn(
            buttonVariants({ variant: "secondary", size: "pill" }),
            "gap-1 py-0 pr-2.5 pl-1.5 text-[13px]",
          )}
        >
          <ChevronLeft className="size-3.5" />
          {back.label}
        </Link>
      ) : (
        <SettingsLink />
      )}
    </header>
  );
}
