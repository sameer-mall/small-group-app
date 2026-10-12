import type { Metadata, Viewport } from "next";
import { Lora, Public_Sans } from "next/font/google";
import { SerwistProvider } from "@serwist/turbopack/react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ThemeProvider } from "@/components/theme-provider";
import { startupImages } from "@/lib/splash-screens";
import "./globals.css";

const lora = Lora({ subsets: ["latin"], variable: "--font-heading" });
const publicSans = Public_Sans({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Small Group",
  description: "Meals, prayer, and notes for our weekly small group",
  // iOS's launch screen for the installed app (src/lib/splash-screens.ts).
  appleWebApp: { startupImage: startupImages() },
  // appleWebApp.capable would render only the unprefixed
  // mobile-web-app-capable, and iOS has long tied startup images to this one.
  other: { "apple-mobile-web-app-capable": "yes" },
};

// Without viewport-fit=cover, iOS reports every env(safe-area-inset-*) as 0,
// and the fixed tab bar sits under the home indicator and the screen's
// rounded corners.
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${lora.variable} ${publicSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col pt-[env(safe-area-inset-top)]">
        {/* iOS 26+ blurs the top of an installed web app, and on iOS 27 the
            blur reaches past the status bar and frosts the Back pill. WebKit
            skips it when a fixed box with a solid background covers the top
            edge: it hit-tests the middle of the top edge, 4px down, ignoring
            pointer-events, for a fixed or sticky box over 10px tall and at
            least 90% as wide as the screen (LocalFrameView::fixedContainerEdges),
            then gives the status bar that box's colour. This strip is that
            box: the page colour, the status bar's height, and 12px at least
            so the probe still finds it when iOS reports no inset. Below menus
            and dialogs (z-50). e2e/top-edge.spec.ts checks it. */}
        <div
          aria-hidden="true"
          data-top-edge
          className="bg-background pointer-events-none fixed inset-x-0 top-0 z-40 h-[max(env(safe-area-inset-top),12px)]"
        />
        <ThemeProvider>
          {/* A hard reload on reconnect destroys anything typed but not yet
              saved (a note, a prayer request, a recipe). Pages refresh softly
              instead (see RefreshOnFocus). */}
          <SerwistProvider swUrl="/serwist/sw.js" reloadOnOnline={false}>
            {children}
          </SerwistProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
