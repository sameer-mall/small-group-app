import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getSession, requireUser } from "@/lib/dal";
import { listPendingRequestsForUser } from "@/lib/groups";
import { NoGroupHome } from "@/components/no-group-home";
import { GroupSwitcher } from "@/components/group-switcher";
import { MeetingsEmpty } from "@/components/meetings-empty";
import { WaitingForApproval } from "@/components/waiting-for-approval";

export default async function HomePage() {
  const user = await requireUser();
  const session = await getSession();
  const [organizations, pendingRequests] = await Promise.all([
    auth.api.listOrganizations({ headers: await headers() }),
    listPendingRequestsForUser(user.id),
  ]);

  if (organizations.length === 0) {
    return <NoGroupHome pendingGroups={pendingRequests} />;
  }

  const activeGroupId = session?.session.activeOrganizationId;
  let activeGroup = organizations.find((org) => org.id === activeGroupId);
  if (!activeGroup) {
    activeGroup = organizations[0];
    await auth.api.setActiveOrganization({
      body: { organizationId: activeGroup.id },
      headers: await headers(),
    });
  }

  return (
    <main className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-serif text-3xl font-semibold">{activeGroup.name}</h1>
        <GroupSwitcher activeGroupId={activeGroup.id} />
      </div>
      <MeetingsEmpty />
      {pendingRequests.length > 0 && (
        <div className="flex flex-col gap-4">
          {pendingRequests.map((request) => (
            <WaitingForApproval key={request.groupId} groupName={request.groupName} />
          ))}
        </div>
      )}
    </main>
  );
}
