"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { forgetUser } from "@/lib/problem-report";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
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
    <button
      type="button"
      onClick={handleSignOut}
      className="text-tertiary border-border min-h-tap rounded-input border-[1.5px] px-5 text-sm font-semibold"
    >
      Sign out
    </button>
  );
}
