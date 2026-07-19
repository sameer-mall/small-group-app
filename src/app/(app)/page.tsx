import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getSession, requireUser } from "@/lib/dal";
import { NoGroupHome } from "@/components/no-group-home";
import { GroupSwitcher } from "@/components/group-switcher";

export default async function HomePage() {
  await requireUser();
  const session = await getSession();
  const organizations = await auth.api.listOrganizations({ headers: await headers() });

  if (organizations.length === 0) {
    return <NoGroupHome />;
  }

  const activeGroupId = session?.session.activeOrganizationId;
  let activeGroup = organizations.find((org) => org.id === activeGroupId);
  if (!activeGroup) {
    activeGroup = organizations[0];
    await auth.api.setActiveOrganization({
      body: { organizationId: activeGroup.id },
      headers: await headers(),
    });
  }

  return (
    <main className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-serif text-3xl font-semibold">{activeGroup.name}</h1>
        <GroupSwitcher activeGroupId={activeGroup.id} />
      </div>
      <div className="bg-card rounded-card shadow-card p-6 text-center">
        <p className="text-muted-foreground">No meetings scheduled yet.</p>
      </div>
    </main>
  );
}
