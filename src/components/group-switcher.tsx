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

  // Split off the trailing word so it can be kept on the chevron's line.
  const words = activeGroupName.split(" ");
  const lastWord = words[words.length - 1];
  const lead = words.slice(0, -1).join(" ");

  async function handleSelect(groupId: string) {
    if (groupId === activeGroupId) return;
    await authClient.organization.setActive({ organizationId: groupId });
    router.refresh();
  }

  return (
    <h1 className="font-serif text-3xl font-semibold">
      <DropdownMenu>
        {/* Inline, not flex: a flex row centres the chevron against the whole
            wrapped block, so a two-line group name flings it to the far right,
            detached from the text. Inline keeps it trailing the last word at
            every name length — and the nowrap span stops it wrapping alone
            onto a line of its own when the name just fills the width. */}
        <DropdownMenuTrigger className="text-left break-words">
          {lead && `${lead} `}
          <span className="whitespace-nowrap">
            {lastWord}
            <ChevronDown
              size={22}
              strokeWidth={2}
              className="text-tertiary ml-1.5 inline-block align-middle"
            />
          </span>
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
