import Link from "next/link";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

// The gear in the Group header. Settings holds what is personal to the member
// (name, appearance, notifications, sign out); the Group screen is the group's.
export function SettingsLink() {
  return (
    <Button render={<Link href="/settings" />} variant="secondary" size="icon" aria-label="Settings">
      <Settings />
    </Button>
  );
}
