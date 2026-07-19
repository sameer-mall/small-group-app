"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function GroupSwitcher({ activeGroupId }: { activeGroupId: string }) {
  const router = useRouter();
  const { data: organizations } = authClient.useListOrganizations();

  if (!organizations || organizations.length <= 1) return null;

  async function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    await authClient.organization.setActive({ organizationId: event.target.value });
    router.refresh();
  }

  return (
    <select
      aria-label="Switch group"
      value={activeGroupId}
      onChange={handleChange}
      className="bg-surface-tint rounded-chip text-sm border-none px-3 py-1.5"
    >
      {organizations.map((org) => (
        <option key={org.id} value={org.id}>
          {org.name}
        </option>
      ))}
    </select>
  );
}
