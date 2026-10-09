import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { WaitingForApproval } from "@/components/waiting-for-approval";
import { SignOutButton } from "@/components/sign-out-button";

export function NoGroupHome({
  pendingGroups = [],
}: {
  pendingGroups?: { groupId: string; groupName: string }[];
}) {
  return (
    <main className="flex min-h-[calc(100dvh-7rem)] flex-col items-center justify-center gap-6 p-6 text-center">
      <div>
        <h1 className="font-serif text-3xl font-semibold">Small Group</h1>
        <p className="text-muted-foreground mt-2 max-w-sm">
          Meals, prayer, and notes for our weekly small group.
        </p>
      </div>
      {pendingGroups.length > 0 && (
        <div className="flex w-full max-w-sm flex-col gap-4">
          {pendingGroups.map((group) => (
            <WaitingForApproval key={group.groupId} groupName={group.groupName} />
          ))}
        </div>
      )}
      <Link
        href="/create-group"
        className={buttonVariants({ size: "block", className: "max-w-sm" })}
      >
        Create a group
      </Link>
      <p className="text-tertiary max-w-sm text-xs">
        Joining an existing group? Ask its admin for the invite link.
      </p>
      <SignOutButton />
    </main>
  );
}
