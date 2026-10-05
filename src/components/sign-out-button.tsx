"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { forgetUser } from "@/lib/problem-report";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    // Serwist's defaultCache keeps navigations/RSC responses by URL for 24h,
    // which on a shared device could hand the next person a page that still
    // has this member's note text on it while offline. Clear every cache
    // first; a failure to clear must never block signing out.
    if ("caches" in window) {
      try {
        await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
      } catch {
        // Best effort only — sign out regardless.
      }
    }
    await authClient.signOut();
    // The next person on this device mustn't inherit this one's identity in
    // error reports.
    forgetUser();
    // push + refresh so the router's cached authed pages can't be reached
    // with back-navigation after the session is gone.
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <Button type="button" variant="outline" onClick={handleSignOut}>
      Sign out
    </Button>
  );
}
