import { cookies, headers } from "next/headers";
import { requireUser } from "@/lib/dal";
import { AppearanceCard } from "@/components/appearance-card";
import { PasskeysCard } from "@/components/passkeys-card";
import { ProfileCard } from "@/components/profile-card";
import { NotificationsCard } from "@/components/notifications-card";
import { ReportProblemDialog } from "@/components/report-problem-dialog";
import { SignOutButton } from "@/components/sign-out-button";
import { WhatsNewCard } from "@/components/whats-new-card";
import { avatarsEnabled } from "@/lib/avatar-storage";
import { PASSKEY_COOKIE } from "@/lib/passkey-cookie";
import { passkeyMethod } from "@/lib/passkey-device";
import { passkeysFor } from "@/lib/passkeys";
import { releases } from "@/lib/whats-new";

// What is personal to the member, as opposed to the group's (see /group),
// plus the app-wide What's new list.
// The fifth tab.
export default async function SettingsPage() {
  const user = await requireUser();
  const [passkeys, jar, requestHeaders] = await Promise.all([passkeysFor(user.id), cookies(), headers()]);

  return (
    <main className="flex flex-col gap-4 p-6">
      <h1 className="font-serif text-3xl font-semibold">Settings</h1>

      <ProfileCard
        name={user.name}
        email={user.email}
        image={user.image ?? null}
        enabled={avatarsEnabled}
      />

      <PasskeysCard
        method={passkeyMethod(requestHeaders.get("user-agent") ?? "")}
        thisDeviceId={jar.get(PASSKEY_COOKIE)?.value ?? null}
        passkeys={passkeys.map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt?.toISOString() ?? null }))}
      />

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
