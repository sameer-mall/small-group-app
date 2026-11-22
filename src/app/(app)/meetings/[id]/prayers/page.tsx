import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { getMeeting } from "@/lib/meetings";
import { getPrayerWall } from "@/lib/prayers";
import { formatMeetingDate } from "@/lib/utils";
import { PrayerWall } from "@/components/prayer-wall";
import { PrayerWallFeed } from "@/components/prayer-wall-feed";
import { YouArePrayingFor } from "@/components/you-are-praying-for";
import { RefreshOnFocus } from "@/components/refresh-on-focus";
import { RefreshWhileOpen } from "@/components/refresh-while-open";

export default async function PrayerWallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/meetings/${id}/prayers`);
  const meeting = await getMeeting(id);
  if (!meeting) notFound();
  // getPrayerWall checks membership itself and throws "forbidden".
  const wall = await getPrayerWall(user.id, meeting.id);
  const assigned = wall.status === "drawn";
  const now = new Date();

  return (
    <main className="flex flex-col gap-4 p-6">
      <RefreshOnFocus />
      {!assigned && (
        <RefreshWhileOpen meetingDate={meeting.date} serverToday={now.toISOString().slice(0, 10)} />
      )}
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-2xl font-semibold">Prayer wall</h1>
        <p className="text-muted-foreground text-sm break-words">
          {`${meeting.title} · ${formatMeetingDate(meeting.date, { weekday: "long", month: "short", day: "numeric" })}`}
        </p>
      </div>
      <section className="bg-card rounded-card shadow-card flex flex-col gap-4 p-[18px]">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-serif text-[19px] font-semibold">
            {assigned ? "This week" : "This week's requests"}
          </h2>
          <span
            className={
              assigned
                ? "bg-success-tint text-success shrink-0 rounded-full px-2.5 py-1 text-xs"
                : "bg-surface-tint text-muted-foreground shrink-0 rounded-full px-2.5 py-1 text-xs"
            }
          >
            {assigned
              ? `Assigned · ${formatMeetingDate(meeting.date, { month: "short", day: "numeric" })}`
              : `${wall.requests.length} ${wall.requests.length === 1 ? "request" : "requests"}`}
          </span>
        </div>
        {assigned ? (
          <>
            <YouArePrayingFor assigned={wall.assigned} />
            <div className="bg-divider h-px" />
            <p className="text-muted-foreground tracking-label text-xs font-semibold uppercase">
              Everyone&apos;s requests
            </p>
            <PrayerWallFeed requests={wall.requests} now={now} assigned myRequestIsAssigned={wall.myRequestIsAssigned} />
          </>
        ) : (
          <PrayerWall wall={wall} meetingId={meeting.id} currentUserId={user.id}>
            <PrayerWallFeed requests={wall.requests} now={now} assigned={false} myRequestIsAssigned={false} />
          </PrayerWall>
        )}
      </section>
    </main>
  );
}
