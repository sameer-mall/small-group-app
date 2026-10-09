import type { ReactNode } from "react";
import { requireUser } from "@/lib/dal";
import { whatsNewPopup } from "@/lib/whats-new";
import { TabBar } from "@/components/tab-bar";
import { SentryUser } from "@/components/sentry-user";
import { WhatsNewDialog } from "@/components/whats-new-dialog";
import { NotificationPromptDialog } from "@/components/notification-prompt-dialog";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const whatsNew = whatsNewPopup(user.whatsNewSeen);

  return (
    <div className="min-h-dvh bg-background">
      <SentryUser id={user.id} name={user.name} email={user.email} />
      {/* Clears the fixed tab bar, which grows by the home-indicator inset. */}
      <div className="pb-[calc(5rem+env(safe-area-inset-bottom))]">{children}</div>
      <TabBar />
      {/* Always mounted, so a dismissal survives the layout re-rendering.
          whatsNewSeen rides along on the session's user row: no extra query. */}
      <WhatsNewDialog {...whatsNew} />
      {/* One launch at a time: when What's new is showing, the notifications
          ask waits for the next launch. */}
      <NotificationPromptDialog deferred={whatsNew.releases.length > 0} />
    </div>
  );
}
