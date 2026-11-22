import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { requireUser } from "@/lib/dal";
import { whatsNewPopup } from "@/lib/whats-new";
import { TabBar } from "@/components/tab-bar";
import { BackBar } from "@/components/back-bar";
import { SentryUser } from "@/components/sentry-user";
import { WhatsNewDialog } from "@/components/whats-new-dialog";
import { PasskeyOffer } from "@/components/passkey-offer";
import { PASSKEY_COOKIE } from "@/lib/passkey-cookie";
import { passkeyMethod } from "@/lib/passkey-device";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const popup = whatsNewPopup(user.whatsNewSeen);
  const [jar, requestHeaders] = await Promise.all([cookies(), headers()]);

  return (
    <div className="min-h-dvh bg-background">
      <SentryUser id={user.id} name={user.name} email={user.email} />
      {/* Clears the fixed tab bar, which grows by the home-indicator inset. */}
      <div className="pb-[calc(5rem+env(safe-area-inset-bottom))]">
        {/* Off the tabs only, scrolling with the page. Full-height screens off
            the tabs subtract it and the tab bar: min-h-[calc(100dvh-7rem)]. */}
        <BackBar />
        {children}
      </div>
      <TabBar />
      {/* Always mounted, so a dismissal survives the layout re-rendering.
          whatsNewSeen rides along on the session's user row: no extra query. */}
      <WhatsNewDialog {...popup} />
      <PasskeyOffer
        method={passkeyMethod(requestHeaders.get("user-agent") ?? "")}
        hasPasskey={jar.has(PASSKEY_COOKIE)}
        whatsNewShowing={popup.releases.length > 0}
      />
    </div>
  );
}
