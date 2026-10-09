import { requireUser } from "@/lib/dal";
import { AppearanceCard } from "@/components/appearance-card";
import { DisplayNameCard } from "@/components/display-name-card";
import { NotificationsCard } from "@/components/notifications-card";
import { ReportProblemDialog } from "@/components/report-problem-dialog";
import { SignOutButton } from "@/components/sign-out-button";
import { WhatsNewCard } from "@/components/whats-new-card";
import { releases } from "@/lib/whats-new";

// What is personal to the member, as opposed to the group's (see /group),
// plus the app-wide What's new list.
// The fifth tab.
export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <main className="flex flex-col gap-4 p-6">
      <h1 className="font-serif text-3xl font-semibold">Settings</h1>

      <DisplayNameCard name={user.name} email={user.email} />

      <AppearanceCard />

      <NotificationsCard />

      <WhatsNewCard latest={releases[0]} />

      <div className="flex flex-col items-center gap-2 pt-2 pb-4">
        <ReportProblemDialog label="Report a problem" look="inline" />
        <SignOutButton />
      </div>
    </main>
  );
}
