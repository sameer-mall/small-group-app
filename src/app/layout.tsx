import type { Metadata } from "next";
import { Lora, Public_Sans } from "next/font/google";
import { SerwistProvider } from "@serwist/turbopack/react";
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
    >
      <body className="min-h-full flex flex-col">
        <SerwistProvider swUrl="/serwist/sw.js">{children}</SerwistProvider>
      </body>
    </html>
  );
}
