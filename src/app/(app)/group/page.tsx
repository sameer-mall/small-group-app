import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getSession, requireMember, requireUser } from "@/lib/dal";
import { getInviteCode, listMembers, listPendingRequests } from "@/lib/groups";
import { GroupNameHeader } from "@/components/group-name-header";
import { MemberRow } from "@/components/member-row";
import { PendingRequestRow } from "@/components/pending-request-row";
import { InviteLinkCard } from "@/components/invite-link-card";
import { LeaveGroupButton } from "@/components/leave-group-button";
import { SignOutButton } from "@/components/sign-out-button";

export default async function GroupPage() {
  const user = await requireUser();
  const session = await getSession();
  const organizations = await auth.api.listOrganizations({ headers: await headers() });

  if (organizations.length === 0) {
    redirect("/");
  }

  // Same active-group resolution as the home page (src/app/(app)/page.tsx):
  // prefer the session's active organization, falling back to the user's
  // first membership and persisting that choice.
  const activeGroupId = session?.session.activeOrganizationId;
  let activeGroup = organizations.find((org) => org.id === activeGroupId);
  if (!activeGroup) {
    activeGroup = organizations[0];
    await auth.api.setActiveOrganization({
      body: { organizationId: activeGroup.id },
      headers: await headers(),
    });
  }

  const { role } = await requireMember(activeGroup.id);
  const isAdmin = role === "admin";

  const [members, pendingRequests, code] = await Promise.all([
    listMembers(activeGroup.id),
    isAdmin ? listPendingRequests(activeGroup.id) : Promise.resolve([]),
    getInviteCode(activeGroup.id),
  ]);

  const inviteUrl = `${process.env.BETTER_AUTH_URL}/join/${code}`;
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

      <LeaveGroupButton groupId={activeGroup.id} />

      <div className="flex justify-center pb-4">
        <SignOutButton />
      </div>
    </main>
  );
}
