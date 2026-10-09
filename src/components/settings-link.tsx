import Link from "next/link";
import { Settings } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

// The gear in the top bar of each tab screen (see TopBar). Settings holds what
// is personal to the member (name, appearance, notifications, sign out); the
// Group screen is the group's.
export function SettingsLink() {
  return (
    <Link
      href="/settings"
      aria-label="Settings"
      className={buttonVariants({ variant: "secondary", size: "icon" })}
    >
      <Settings />
    </Link>
  );
}
