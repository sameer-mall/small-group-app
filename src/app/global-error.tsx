"use client";

import "./globals.css";
import { ErrorScreen } from "@/components/error-screen";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="bg-background min-h-full">
        <ErrorScreen error={error} retry={unstable_retry} />
      </body>
    </html>
  );
}
