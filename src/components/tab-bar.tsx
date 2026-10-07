"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, HandHeart, UtensilsCrossed, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Meetings", icon: CalendarDays },
  { href: "/recipes", label: "Recipes", icon: UtensilsCrossed },
  { href: "/prayers", label: "My prayers", icon: HandHeart },
  { href: "/group", label: "Group", icon: Users },
] as const;

export function TabBar() {
  const pathname = usePathname();

  return (
    // The bottom padding lifts the tabs clear of the home indicator; the bar's
    // background still runs to the screen edge.
    <nav className="bg-surface-tab border-divider-tab fixed inset-x-0 bottom-0 grid grid-cols-4 border-t pb-[env(safe-area-inset-bottom)]">
      {TABS.map(({ href, label, icon: Icon }) => {
        // Settings is reached from the Group header, so it keeps that tab lit.
        const active =
          href === "/"
            ? pathname === "/" || pathname.startsWith("/meetings/")
            : href === "/group"
              ? pathname === "/group" || pathname.startsWith("/settings")
              : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "min-h-tap flex flex-col items-center justify-center gap-1 py-2 text-tab font-semibold",
              active ? "text-accent-strong font-bold" : "text-tab-inactive",
            )}
          >
            <Icon size={22} strokeWidth={1.8} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
