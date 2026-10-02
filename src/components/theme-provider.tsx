"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Hearth's dark tokens live under [data-theme="dark"] (src/app/globals.css).
// next-themes injects a blocking script that sets the attribute from
// prefers-color-scheme before first paint, so there's no flash of the wrong
// theme; <html> carries suppressHydrationWarning because the attribute is
// written before React hydrates.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="data-theme" defaultTheme="system" enableSystem>
      {children}
    </NextThemesProvider>
  );
}
