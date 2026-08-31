"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type SwitchableGroup = { id: string; name: string };

// Doubles as the home page's group heading: the name IS the menu trigger, so
// there's no second chip repeating it. The menu always carries "Create a
// group" — that link used to live only on <NoGroupHome />, which stops
// rendering the moment you have one group, leaving no way to start a second.
//
// `groups` comes from the server render rather than authClient's
// useListOrganizations(): that hook caches the list in a module-level atom
// that createGroup() (a direct DB write, not an authClient call) never
// invalidates, so a freshly created group stayed missing from the menu — the
// active one included — until a full page load.
export function GroupSwitcher({
  groups,
  activeGroupId,
  activeGroupName,
}: {
  groups: SwitchableGroup[];
  activeGroupId: string;
  activeGroupName: string;
}) {
  const router = useRouter();

  async function handleSelect(groupId: string) {
    if (groupId === activeGroupId) return;
    await authClient.organization.setActive({ organizationId: groupId });
    router.refresh();
  }

  return (
    <h1 className="font-serif text-3xl font-semibold">
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1.5 text-left">
          {activeGroupName}
          <ChevronDown size={22} strokeWidth={2} className="text-tertiary mt-1 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto min-w-56">
          <DropdownMenuRadioGroup value={activeGroupId} onValueChange={handleSelect}>
            {groups.map((group) => (
              <DropdownMenuRadioItem key={group.id} value={group.id} className="min-h-tap">
                {group.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/create-group" />} className="min-h-tap">
            <Plus />
            Create a group
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </h1>
  );
}
