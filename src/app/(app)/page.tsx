import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getSession, requireUser, resolveActiveGroup } from "@/lib/dal";
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

  const activeGroup = await resolveActiveGroup(
    session?.session.activeOrganizationId,
    organizations,
  );

  return (
    <main className="flex flex-col gap-6 p-6">
      <GroupSwitcher
        groups={organizations.map(({ id, name }) => ({ id, name }))}
        activeGroupId={activeGroup.id}
        activeGroupName={activeGroup.name}
      />
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
