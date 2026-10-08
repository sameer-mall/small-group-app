import { requireUser } from "@/lib/dal";
import { releases } from "@/lib/whats-new";
import { formatMeetingDate } from "@/lib/utils";

// Every release note, newest first, reached from the Settings screen's What's
// new card. App-wide, not per group, so it needs no group. It sits under
// /settings so the Group tab stays lit; like every page, no back link.
export default async function WhatsNewPage() {
  await requireUser();

  return (
    <main className="flex flex-col gap-2.5 px-4 pt-6 pb-6">
      <div className="flex flex-col gap-1 px-1 pb-1.5">
        <h1 className="font-serif text-[28px] font-semibold">What&apos;s new</h1>
        <p className="text-muted-foreground text-sm">The latest changes to the app</p>
      </div>
      {releases.map((release) => (
        <article key={release.id} className="bg-card rounded-card shadow-card flex flex-col gap-2 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="min-w-0 font-serif text-[17px] font-semibold break-words">
              {release.title}
            </h2>
            <span className="text-tertiary shrink-0 text-right text-xs">
              {formatMeetingDate(release.date, { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>
          <p className="text-prayer text-[15px] leading-[1.55]">{release.body}</p>
        </article>
      ))}
    </main>
  );
}
