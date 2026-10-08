import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Release } from "@/lib/whats-new";
import { formatMeetingDate } from "@/lib/utils";

// The way back to every release note after the popup has been dismissed.
// No "new" dot: the popup already told the member once.
export function WhatsNewCard({ latest }: { latest: Release }) {
  return (
    <Link
      href="/group/whats-new"
      className="bg-card rounded-card shadow-card flex items-center justify-between gap-3 p-4"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-muted-foreground tracking-label text-xs uppercase">What&apos;s new</p>
        <p className="text-strong truncate font-medium">{latest.title}</p>
        <p className="text-tertiary text-xs">
          {formatMeetingDate(latest.date, { month: "short", day: "numeric" })}
        </p>
      </div>
      <ChevronRight aria-hidden className="text-tertiary size-5 shrink-0" />
    </Link>
  );
}
