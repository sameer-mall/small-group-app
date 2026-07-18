import type { ReactNode } from "react";
import { requireUser } from "@/lib/dal";
import { TabBar } from "@/components/tab-bar";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireUser();

  return (
    <div className="min-h-dvh bg-background">
      <div className="pb-20">{children}</div>
      <TabBar />
    </div>
  );
}
