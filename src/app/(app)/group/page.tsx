import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, authBaseURL } from "@/lib/auth";
import { getSession, requireMember, requireUser, resolveActiveGroup } from "@/lib/dal";
import { getInviteCode, listMembers, listPendingRequests } from "@/lib/groups";
import { GroupNameHeader } from "@/components/group-name-header";
import { MemberRow } from "@/components/member-row";
import { PendingRequestRow } from "@/components/pending-request-row";
import { InviteLinkCard } from "@/components/invite-link-card";
import { LeaveGroupButton } from "@/components/leave-group-button";

export default async function GroupPage() {
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

  const { role } = await requireMember(activeGroup.id);
  const isAdmin = role === "admin";

  const [members, pendingRequests, code] = await Promise.all([
    listMembers(activeGroup.id),
    isAdmin ? listPendingRequests(activeGroup.id) : Promise.resolve([]),
    getInviteCode(activeGroup.id),
  ]);

  const inviteUrl = `${authBaseURL}/join/${code}`;
  const memberCount = members.length;

  return (
    <main className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <GroupNameHeader groupId={activeGroup.id} name={activeGroup.name} isAdmin={isAdmin} />
        <p className="text-muted-foreground text-sm">
          {memberCount} member{memberCount === 1 ? "" : "s"}
          {isAdmin ? " · you're an admin" : ""}
        </p>
      </div>

      {isAdmin && pendingRequests.length > 0 && (
        <div className="flex flex-col gap-3">
          {pendingRequests.map((request) => (
            <PendingRequestRow key={request.id} request={request} />
          ))}
        </div>
      )}

      <InviteLinkCard url={inviteUrl} groupId={activeGroup.id} isAdmin={isAdmin} />

      <div className="bg-card rounded-card shadow-card flex flex-col px-4">
        <p className="text-muted-foreground tracking-label px-0.5 pt-3 pb-1 text-xs uppercase">
          Members
        </p>
        {members.map((member) => (
          <MemberRow
            key={member.userId}
            member={member}
            groupId={activeGroup.id}
            isAdmin={isAdmin}
            isSelf={member.userId === user.id}
          />
        ))}
      </div>

      {/* Personal controls (name, appearance, notifications, sign out) live on
          /settings, behind the gear in the top bar. */}
      <div className="pb-4">
        <LeaveGroupButton groupId={activeGroup.id} />
      </div>
    </main>
  );
}
