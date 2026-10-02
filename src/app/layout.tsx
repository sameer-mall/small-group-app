import type { Metadata } from "next";
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
      <body className="min-h-full flex flex-col">
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
