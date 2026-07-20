"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    // push + refresh so the router's cached authed pages can't be reached
    // with back-navigation after the session is gone.
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="text-tertiary min-h-tap text-sm font-semibold"
    >
      Sign out
    </button>
  );
}
