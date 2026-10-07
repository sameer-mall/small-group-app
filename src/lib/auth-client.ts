import { createAuthClient } from "better-auth/react";
import { emailOTPClient, organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [emailOTPClient(), organizationClient()],
});

// authClient calls resolve `{ data, error }` when the server answers with an
// error, but reject when the request never gets an answer (offline, or
// Safari's "TypeError: Load failed"): better-fetch doesn't catch fetch()
// itself. Callers catch that too and show this, so a screen can't be left
// waiting on a request that already failed.
export const UNREACHABLE_MESSAGE = "Couldn't reach the server. Check your connection and try again.";
