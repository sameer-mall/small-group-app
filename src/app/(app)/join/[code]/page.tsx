import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { getGroupByInviteCode, getMembership, getPendingRequest } from "@/lib/groups";
import { WaitingForApproval } from "@/components/waiting-for-approval";
import { Button } from "@/components/ui/button";
import { requestToJoinAction } from "../actions";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const user = await requireUser(`/join/${code}`);

  const group = await getGroupByInviteCode(code);
  if (!group) {
    return (
      <main className="flex min-h-[calc(100dvh-5rem)] flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="font-serif text-xl font-semibold">Invite link not found</h1>
        <p className="text-muted-foreground max-w-sm">
          This invite link is no longer valid. Ask the group admin for a fresh one.
        </p>
      </main>
    );
  }

  const membership = await getMembership(group.groupId, user.id);
  if (membership) redirect("/");

  const pending = await getPendingRequest(group.groupId, user.id);
  if (pending) {
    return (
      <main className="flex min-h-[calc(100dvh-5rem)] flex-col items-center justify-center p-6">
        <WaitingForApproval groupName={group.name} />
      </main>
    );
  }

  return (
    <main className="flex min-h-[calc(100dvh-5rem)] flex-col items-center justify-center p-6">
      <div className="bg-card rounded-card shadow-card mx-auto w-full max-w-sm p-6 text-center">
        <h1 className="font-serif text-xl font-semibold">{group.name}</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          You&apos;ve been invited to join this group. An admin will approve your request.
        </p>
        <form action={requestToJoinAction.bind(null, code)} className="mt-4">
          <Button type="submit" size="lg" className="min-h-tap w-full font-bold">
            Ask to join
          </Button>
        </form>
      </div>
    </main>
  );
}
