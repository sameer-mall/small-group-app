import type { ReactNode } from "react";
import { requireUser } from "@/lib/dal";
import { TabBar } from "@/components/tab-bar";
import { SentryUser } from "@/components/sentry-user";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-dvh bg-background">
      <SentryUser id={user.id} name={user.name} email={user.email} />
      {/* Clears the fixed tab bar, which grows by the home-indicator inset. */}
      <div className="pb-[calc(5rem+env(safe-area-inset-bottom))]">{children}</div>
      <TabBar />
    </div>
  );
}
