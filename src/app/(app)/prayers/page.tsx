import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getSession, requireUser, resolveActiveGroup } from "@/lib/dal";
import { listMyAssignedPrayers } from "@/lib/prayers";
import { DrawnPrayerList } from "@/components/drawn-prayer-list";

export default async function PrayersPage() {
  const user = await requireUser();
  const session = await getSession();
  const organizations = await auth.api.listOrganizations({ headers: await headers() });

  if (organizations.length === 0) {
    redirect("/");
  }

  const activeGroup = await resolveActiveGroup(
    session?.session.activeOrganizationId,
    organizations,
  );
  // Checks membership itself — no separate requireMember needed here.
  const prayers = await listMyAssignedPrayers(user.id, activeGroup.id);

  return (
    <main className="flex flex-col gap-2.5 px-4 pt-6 pb-6">
      <div className="flex flex-col gap-1 px-1 pb-1.5">
        <h1 className="font-serif text-[28px] font-semibold">My prayers</h1>
        <p className="text-muted-foreground text-sm">Requests you&apos;ve been assigned, week by week</p>
      </div>
      {prayers.length === 0 ? (
        <div className="flex flex-col gap-2 py-8 text-center">
          <p className="font-serif text-xl font-semibold">Nothing assigned yet</p>
          <p className="text-muted-foreground text-sm">
            When your group assigns prayers, the one you get lands here.
          </p>
        </div>
      ) : (
        <DrawnPrayerList prayers={prayers} serverToday={new Date().toISOString().slice(0, 10)} />
      )}
    </main>
  );
}
