import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getSession, requireUser, resolveActiveGroup } from "@/lib/dal";
import { listPendingRequestsForUser } from "@/lib/groups";
import { listMeetings } from "@/lib/meetings";
import { NoGroupHome } from "@/components/no-group-home";
import { GroupSwitcher } from "@/components/group-switcher";
import { MeetingsEmpty } from "@/components/meetings-empty";
import { MeetingList } from "@/components/meeting-list";
import { NewMeetingSheet } from "@/components/new-meeting-sheet";
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

  // The group was just confirmed above via resolveActiveGroup, which only
  // returns organizations the user belongs to — listMeetings itself does no
  // authorization, so it must only ever be called with a group membership
  // already confirmed.
  const meetings = await listMeetings(activeGroup.id);

  return (
    <main className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-serif text-3xl font-semibold">{activeGroup.name}</h1>
        <GroupSwitcher activeGroupId={activeGroup.id} />
      </div>
      {meetings.length === 0 ? (
        <MeetingsEmpty />
      ) : (
        <MeetingList meetings={meetings} serverToday={new Date().toISOString().slice(0, 10)} />
      )}
      <NewMeetingSheet groupId={activeGroup.id} />
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
