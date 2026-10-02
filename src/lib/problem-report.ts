import * as Sentry from "@sentry/nextjs";

// The browser side of "see what happened": who is signed in, and the
// "Report a problem" form. Browser only; server code uses
// src/lib/monitoring.ts.

type Reporter = { name: string; email: string };

// Kept here, not on Sentry's user: every event carries the user's id and
// nothing else about them. Name and email go only on a report the member
// chooses to send, so the owner knows who to reply to.
let reporter: Reporter | null = null;

export function identifyUser(user: { id: string; name: string; email: string }) {
  Sentry.setUser({ id: user.id });
  reporter = { name: user.name, email: user.email };
}

export function forgetUser() {
  Sentry.setUser(null);
  reporter = null;
}

// Call when the report form opens. The replay buffer holds about the last
// minute; uploading it now, before the member spends a minute typing, keeps
// what went wrong in the recording. Sentry's own feedback widget does the
// same on open.
export function startProblemReport() {
  void Sentry.getReplay()?.flush();
}

export function sendProblemReport(message: string, associatedEventId?: string) {
  Sentry.captureFeedback(
    { message, ...(reporter ?? {}), ...(associatedEventId ? { associatedEventId } : {}) },
    { includeReplay: true },
  );
}

// No 0/O or 1/I/L: a member reads this off their screen and says or texts it.
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

// The code an error screen shows. It goes to Sentry as the `ref` tag, so
// searching `ref:<code>` finds the exact event.
export function makeReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length]).join("");
}
