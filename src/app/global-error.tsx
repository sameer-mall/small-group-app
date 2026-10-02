"use client";

import { useSyncExternalStore } from "react";
import "./globals.css";
import { ErrorScreen } from "@/components/error-screen";

// This replaces the root layout, next-themes included, so nothing else sets
// data-theme on this <html> and the error screen would always be light.
// Resolve it the way next-themes does: the Appearance choice it saves in
// localStorage under its default key, "theme", else the system scheme.
const DARK = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void) {
  const query = matchMedia(DARK);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function currentTheme() {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage blocked (private mode, site data off): use the system scheme.
  }
  return matchMedia(DARK).matches ? "dark" : "light";
}

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => undefined);

  return (
    <html lang="en" data-theme={theme} style={{ colorScheme: theme }} className="h-full antialiased">
      <body className="bg-background min-h-full">
        <ErrorScreen error={error} retry={unstable_retry} />
      </body>
    </html>
  );
}
