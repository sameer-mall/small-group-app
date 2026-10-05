import type { Metadata, Viewport } from "next";
import { Lora, Public_Sans } from "next/font/google";
import { SerwistProvider } from "@serwist/turbopack/react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const lora = Lora({ subsets: ["latin"], variable: "--font-heading" });
const publicSans = Public_Sans({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Small Group",
  description: "Meals, prayer, and notes for our weekly small group",
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
