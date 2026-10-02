"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

const subscribe = () => () => {};

export function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  // The stored choice lives in localStorage, so the server can't know it.
  // Render nothing selected until hydrated rather than guessing and
  // mismatching.
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const selected = hydrated ? (theme ?? "system") : null;

  return (
    <div className="bg-card rounded-card shadow-card flex flex-col gap-2.5 p-4">
      <p id="appearance-label" className="text-muted-foreground tracking-label text-xs uppercase">
        Appearance
      </p>
      <div
        role="radiogroup"
        aria-labelledby="appearance-label"
        className="bg-surface-tint rounded-chip grid grid-cols-3 gap-1 p-1"
      >
        {OPTIONS.map(({ value, label }) => {
          const active = selected === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(value)}
              className={cn(
                "min-h-tap rounded-sm text-sm font-semibold",
                active ? "bg-card text-foreground shadow-card" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      <p className="text-tertiary text-xs">System follows your phone&apos;s setting. Saved on this device.</p>
    </div>
  );
}
