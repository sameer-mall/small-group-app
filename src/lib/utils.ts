import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// First letter of the first and last name tokens, e.g. "Priya K." -> "PK".
// Single-word names fall back to their first two characters.
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Open-redirect guard for the `?next=` param: only allow same-origin,
// absolute-path targets. Rejects absolute URLs (https://evil.com) and
// protocol-relative forms (//evil.com, /\evil.com, which browsers navigate
// off-origin), falling back to "/". Apply wherever an attacker-controllable
// `next` reaches redirect()/router.push().
export function safeNextPath(next: string | null | undefined): string {
  if (!next || next[0] !== "/") return "/";
  if (next[1] === "/" || next[1] === "\\") return "/";
  return next;
}

// Meetings are stored as plain YYYY-MM-DD strings (see src/lib/meetings.ts),
// with no time-of-day or timezone attached. Formatting via Date requires
// pinning a UTC time-of-day and timezone — otherwise the browser's own
// timezone would shift the date by a day for anyone west of UTC, and it
// would render differently on the server (UTC) than in the browser,
// tripping a hydration mismatch.
export function formatMeetingDate(
  date: string,
  options: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" },
): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    ...options,
    timeZone: "UTC",
  });
}
