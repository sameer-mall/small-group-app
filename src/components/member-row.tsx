"use client";

import { useActionState } from "react";
import { cn, initials } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  demoteMemberAction,
  promoteMemberAction,
  removeMemberAction,
  type ActionState,
} from "@/app/(app)/group/actions";

const initialState: ActionState = { error: null, success: false };

export type MemberRowMember = {
  userId: string;
  name: string;
  // `member.role` is a plain text column (see src/db/auth-schema.ts), not a
  // DB-level enum — any non-"admin" value is treated as a regular member.
  role: string;
};

export function MemberRow({
  member,
  groupId,
  isAdmin,
  isSelf,
}: {
  member: MemberRowMember;
  groupId: string;
  isAdmin: boolean;
  isSelf: boolean;
}) {
  const [promoteState, promoteAction] = useActionState(
    promoteMemberAction.bind(null, groupId, member.userId),
    initialState,
  );
  const [demoteState, demoteAction] = useActionState(
    demoteMemberAction.bind(null, groupId, member.userId),
    initialState,
  );
  const [removeState, removeAction] = useActionState(
    removeMemberAction.bind(null, groupId, member.userId),
    initialState,
  );

  const error = promoteState.error ?? demoteState.error ?? removeState.error;
  const canManage = isAdmin && !isSelf;

  return (
    <div className="border-divider flex flex-col border-b py-0.5 last:border-b-0" data-testid="member-row">
      <div className="flex items-center gap-2.5 py-2.5">
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
            isSelf ? "bg-primary text-primary-foreground" : "bg-avatar text-avatar-foreground",
          )}
        >
          {isSelf ? "You" : initials(member.name)}
        </div>
        <div className={cn("flex-1 text-[15px]", isSelf && "font-semibold")}>
          {isSelf ? "You" : member.name}
        </div>
        {member.role === "admin" && (
          <span className="bg-accent-tint text-accent-strong rounded-full px-2.5 py-0.5 text-[11px] font-bold">
            ADMIN
          </span>
        )}
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="text-tertiary min-h-tap flex min-w-[32px] items-center justify-center text-lg"
              aria-label={`Manage ${member.name}`}
            >
              &#8943;
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {member.role === "member" ? (
                <DropdownMenuItem onClick={() => promoteAction(new FormData())}>
                  Make admin
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => demoteAction(new FormData())}>
                  Remove admin
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                variant="destructive"
                onClick={() => removeAction(new FormData())}
              >
                Remove from group
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {error && <p className="text-destructive pb-2 text-xs">{error}</p>}
    </div>
  );
}
