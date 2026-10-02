# Error Monitoring Implementation Plan (Plan 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a member says something went wrong, the owner can see what happened: the error, who it happened to, a text-masked replay of the moments before, and a log of the failures that never throw.

**Architecture:** `@sentry/nextjs` v11, initialized from Next's `instrumentation.ts` (server) and `instrumentation-client.ts` (browser), both built from one shared, unit-tested options module (`sentry-config.ts`). That module turns Sentry's v11 data collection back down to v10's defaults and scrubs query parameters out of every event. The replay buffers in memory and is uploaded only when an error happens or someone opens "Report a problem". Server code records non-throwing failures through a small wrapper (`monitoring.ts`); the browser's report and identity code lives in `problem-report.ts`. Error boundaries show a short reference code that finds the event in Sentry.

**Tech Stack:** Next.js 16 App Router (Turbopack), TypeScript, `@sentry/nextjs` ^11.2, Better Auth (email OTP via Resend), Tailwind v4 + shadcn/ui on Base UI, Vitest, Playwright.

**Spec:** No separate design doc. The **Decisions** section below was settled with the owner on 2026-10-01 and is binding. The parent spec, `docs/superpowers/specs/2026-07-02-small-group-pwa-design.md`, defines the privacy model for prayer requests and notes that this plan must not leak.

**Precondition:** none. This plan is independent of plan 5 (notes). If plan 5 has merged first, Task 2 also covers `src/app/(app)/notes/actions.ts`; if not, the CLAUDE.md convention added in Task 5 tells plan 5's executor what to add.

## Decisions (with the owner, 2026-10-01)

- **Platform:** Sentry, free Developer plan (5,000 errors, 50 replays, 5 GB of logs a month; 1 user; 30-day retention), on the owner's **personal** account. GlitchTip (MIT) accepts the same SDK, so leaving later means changing the DSN.
- **The goal is user reports.** Many reports involve no exception ("my code never came", "it said I couldn't"), so this plan covers more than crashes: identity, a replay of what was on screen, an in-app report, and logs.
- **Identity:** events and logs carry the user's **id only**. A report the member chooses to send also carries their **name and email**, so the owner can reply.
- **Replay:** never record whole sessions (`replaysSessionSampleRate: 0`). Keep a rolling buffer in memory and upload it only on an error (`replaysOnErrorSampleRate: 1.0`) or when "Report a problem" opens. All text and inputs masked, media blocked, no network bodies. These are Sentry's defaults, spelled out so a future default can't loosen them.
- **Data collection:** v11 collects cookies, HTTP bodies, user info, and database query data **by default**. `dataCollection` is set back to the v10 defaults Sentry's migration guide gives. Drizzle's `DrizzleQueryError` puts every bound value in its message (`Failed query: … \nparams: …`), and those values are whatever was being written, a prayer request or a note included. `beforeSend` cuts them from every event.
- **Reference codes:** error screens show a 6-character code (no 0/O/1/I/L), sent as the Sentry tag `ref`. A member can read it out or text it; the owner searches `ref:<code>`.
- **Tunnel:** browser events post to `/monitoring` on the app's own domain, since ad blockers drop requests to sentry.io.
- **No performance tracing.** `tracesSampleRate` stays unset. Reports need errors, replays and logs, not timings.
- **Accepted cost:** the replay integration adds tens of KB of JavaScript to every page.

## Global Constraints

- Next.js 16 App Router + TypeScript. Next 16 error boundaries receive `unstable_retry` (not `reset`) for "Try again"; see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`.
- **`@sentry/nextjs` ^11.2.0.** Every `Sentry.init` spreads `sharedSentryOptions()` from `src/lib/sentry-config.ts`; nothing initializes Sentry any other way.
- **Privacy is binding.** Nothing sent to Sentry (an error message, a tag, a log, a log attribute) may contain user content: prayer request text, note text, names, email addresses, or sign-in codes. Ids and short codes only. The single exception is a problem report the member writes and sends themselves, which carries their own message, name, and email.
- **Server code reads environment variables through `src/lib/env.ts`** (PR #55), which validates them when the module loads. The one exception is `src/lib/sentry-config.ts`: the browser imports it, so it reads `process.env.NEXT_PUBLIC_*` directly. The build-time `SENTRY_*` variables are read only in `next.config.ts`.
- **The SDK is off without a DSN.** Local dev, Vitest, and e2e send nothing. **Never put `NEXT_PUBLIC_SENTRY_DSN` in `.env` or `.env.local`:** `next build` inlines it, and every e2e run would then report to the real project.
- **Copy:** no em dashes in any UI string (PR #54 removed them all). Sentence case, no exclamation marks. New strings, used verbatim:
  - Group tab: "Report a problem"
  - Dialog: "Report a problem" · "Tell us what you were trying to do and what went wrong. Your report also includes a recording of the last minute on your screen, with all text hidden." · "What happened?" · "Cancel" · "Send report"
  - Dialog, after sending: "Thanks for letting us know" · "Your report was sent." · "Done"
  - Error screen: "Something went wrong" · "Try again. If it keeps happening, report it so we can fix it." · "Reference" · "Try again" · "Report this problem"
- **Hearth fidelity:** tokens and utilities only, never a hardcoded color that has a token. Cards are `bg-card rounded-card shadow-card`; Lora (`font-serif`) for headings; `text-muted-foreground`, `text-tertiary`, `text-strong`, `text-accent-strong` as elsewhere.
- **Mobile-first (binding):** the report field is ≥16px (stops iOS zooming on focus); tap targets use `min-h-tap`. **Every task that ships UI is verified at a 390×844 viewport before it is reported done.**
- **Client bundles never import a server module.** `src/lib/monitoring.ts` is server-only (it is imported by actions and `auth-email.ts`); `src/lib/problem-report.ts` is browser-only. `src/lib/sentry-config.ts` is imported by both and must stay free of Node and database imports.
- **Tests green at every commit:** `mise run lint && mise run typecheck && mise run test`; add `mise run build && CI=1 mise run e2e` where a task says so.
- **One branch, one PR for the whole plan:** `feat/error-monitoring`, off `main`. **No `Co-Authored-By`/Claude trailers on commits.** **Agents never merge:** the PR stops at ready; the owner merges.

**Machine notes.** Each of these has cost real time before:

- **`pnpm add` needs the Bash sandbox override.** The sandbox denies `registry.npmjs.org`.
- `git push` and `gh` need the sandbox override and `gh auth switch --user sameer-mall`. `next build` needs the override too (it fetches Google Fonts).
- **Anything that touches Postgres needs the sandbox override:** `db:migrate`, `test`, `e2e`. Vitest's global setup migrates the database, so **even pure unit tests need Docker running** (`mise run db:up`).
- A fresh worktree lacks the gitignored `.env` the tests read. Copy it from the main checkout before the first test run.
- **e2e runs `next start` against the last build.** Run `mise run build` after every source change before `mise run e2e`, or the run silently tests old code. **Always `CI=1 mise run e2e`.** Without `CI=1`, Playwright reuses whatever already listens on :3000.
- **Browser verification:** `.env.local` pins `BETTER_AUTH_URL` to `http://localhost:3200`. Use the `web-start` launch config (`mise run build`, then `next start` on 3200), not `web` on 3000. Sign in through the file mail sink: submit the email on `/sign-in`, read the newest line **addressed to that email** in `.debug-mail.jsonl`, and type its `otp` into "Sign-in code".
- **The Sentry MCP connector in this environment may be signed in to the owner's work account,** like the Vercel one. Before reading Sentry through it, run `find_organizations` and use it only if it lists the owner's personal org. Otherwise ask the owner to check the Sentry UI.

## Owner setup (before Task 5; agents can't create accounts)

1. Sign up for Sentry with your **personal** account and stay on the free Developer plan. Create a project: platform **Next.js**, name `small-group`.
2. Copy the project's DSN (Project Settings → Client Keys (DSN)). It is not a secret: it ships in every page's JavaScript.
3. Create an auth token Sentry can use to upload source maps (Sentry Settings → Auth Tokens).
4. In Vercel (personal team, project `small-group-app`), Settings → Environment Variables, for **Production and Preview**: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` (mark sensitive), `SENTRY_ORG` (org slug), `SENTRY_PROJECT` (project slug). The Sentry integration on the Vercel Marketplace sets these for you, if you'd rather.
5. In the Sentry project, Settings → Security & Privacy: turn on **Prevent Storing of IP Addresses**. Leave the data scrubber and its default scrubbers on.
6. Keep the "alert on every new issue" email rule Sentry creates with a new project.
7. Give the executor the DSN in chat for Task 5's local check. **Never paste the auth token.**

## Out of scope

- **The sign-in screen still says the code is on its way when Resend refuses it.** Better Auth's `runInBackgroundOrAwait` catches whatever `sendVerificationOTP` throws and only logs it (`node_modules/better-auth/dist/context/create-context.mjs`), so the endpoint reports success. This plan makes the failure reach Sentry (an issue plus an email to the owner); showing it on screen needs a different send path.
- **Members with no group yet** can't reach the Group tab, so their only in-app report is the error screen's.
- **Reports sent offline are dropped.** `captureFeedback` doesn't queue.
- Performance tracing, uptime checks, and session-wide replay.

---

### Task 1: The SDK, with privacy-first options

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (via `pnpm add`)
- Create: `src/lib/sentry-config.ts`
- Test: `src/lib/sentry-config.test.ts`
- Create: `src/instrumentation.ts`, `src/instrumentation-client.ts`
- Modify: `next.config.ts`, `src/proxy.ts` (matcher), `.env.example`

**Interfaces:**
- Produces:
  - `sharedSentryOptions()`, returning `{ dsn: string | undefined; environment: string; dataCollection; beforeSend: scrubEvent }`, where `dataCollection` is the v10-defaults object below. Every `Sentry.init` spreads it.
  - `scrubEvent(event: ErrorEvent, hint: EventHint): ErrorEvent`, Sentry's `beforeSend`. It cuts query params from exception values, the message, and breadcrumb messages; drops console breadcrumb data, the request body, and cookies; and tags an error that carries a Next.js `digest` with `digest`. Task 4's error screen relies on that tag.
  - The tunnel route `/monitoring`, excluded from `src/proxy.ts`'s matcher.

- [ ] **Step 1: Install the SDK**

Run (sandbox override): `pnpm add @sentry/nextjs@^11.2.0`
Expected: `package.json` lists `"@sentry/nextjs": "^11.2.x"` (or newer 11.x) under `dependencies`.

Then confirm the installed SDK has the v11 option these decisions rely on. TypeScript won't flag a misspelled or missing `dataCollection` key, because the options reach `Sentry.init` through a spread:
`grep -rln "dataCollection" node_modules/.pnpm/@sentry+core@*/node_modules/@sentry/core/build/types | head -3`
Expected: at least one file. If there is none, stop and report the installed version (`pnpm list @sentry/nextjs`) to the owner. The privacy settings would silently do nothing.

- [ ] **Step 2: Write the failing tests**

`src/lib/sentry-config.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { scrubEvent, sharedSentryOptions } from "./sentry-config";

// What Drizzle's DrizzleQueryError says when an insert fails: the query, then
// every bound value. Here one of those values is a prayer request.
const FAILED_INSERT =
  'Failed query: insert into "prayer_requests" ("id", "meeting_id", "author_id", "body") values ($1, $2, $3, $4)\n' +
  "params: r1,m1,u1,Please pray for my mother's surgery";

function eventWith(value: string): ErrorEvent {
  return { exception: { values: [{ type: "Error", value }] } } as ErrorEvent;
}

describe("scrubEvent", () => {
  it("keeps the failed query but drops the values it was writing", () => {
    const event = scrubEvent(eventWith(FAILED_INSERT), {});
    const value = event.exception!.values![0].value!;
    expect(value).toContain('insert into "prayer_requests"');
    expect(value).toContain("params: [scrubbed]");
    expect(JSON.stringify(event)).not.toContain("surgery");
  });

  it("scrubs a linked cause, the message, and breadcrumbs the same way", () => {
    const event = {
      message: FAILED_INSERT,
      exception: {
        values: [
          { type: "DrizzleQueryError", value: FAILED_INSERT },
          { type: "Error", value: "outer" },
        ],
      },
      breadcrumbs: [
        {
          category: "console",
          message: `Failed to run background task: ${FAILED_INSERT}`,
          data: { arguments: ["Failed to run background task:", FAILED_INSERT] },
        },
      ],
    } as ErrorEvent;
    expect(JSON.stringify(scrubEvent(event, {}))).not.toContain("surgery");
  });

  it("never sends a request body or cookies", () => {
    const event = {
      request: { url: "https://example.com/meetings/m1", data: "body=secret", cookies: { session: "abc" } },
    } as ErrorEvent;
    const scrubbed = scrubEvent(event, {});
    expect(scrubbed.request).toEqual({ url: "https://example.com/meetings/m1" });
  });

  it("tags a server error with its Next.js digest, so the error screen's event leads to it", () => {
    const error = Object.assign(new Error("boom"), { digest: "2847503921" });
    const event = scrubEvent(eventWith("boom"), { originalException: error });
    expect(event.tags).toEqual({ digest: "2847503921" });
  });

  it("leaves an ordinary error alone", () => {
    const event = scrubEvent(eventWith("Cannot read properties of undefined"), {
      originalException: new Error("Cannot read properties of undefined"),
    });
    expect(event.exception!.values![0].value).toBe("Cannot read properties of undefined");
    expect(event.tags).toBeUndefined();
  });
});

describe("sharedSentryOptions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("collects none of the extra data Sentry v11 collects by default", () => {
    expect(sharedSentryOptions().dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpBodies: [],
      databaseQueryData: false,
    });
  });

  it("stays off without a DSN, so local dev and e2e send nothing", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    expect(sharedSentryOptions().dsn).toBeUndefined();
  });

  it("labels events with the Vercel environment, or local", () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
    expect(sharedSentryOptions().environment).toBe("preview");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "");
    expect(sharedSentryOptions().environment).toBe("local");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run (sandbox override): `mise run db:up && pnpm vitest run src/lib/sentry-config.test.ts`
Expected: FAIL. `./sentry-config` can't be resolved.

- [ ] **Step 4: Write the options module**

`src/lib/sentry-config.ts`:

```ts
import type { ErrorEvent, EventHint } from "@sentry/nextjs";

// The one place Sentry's options are decided; instrumentation.ts (server) and
// instrumentation-client.ts (browser) both spread these. Imported by both, so
// it must stay free of Node and database imports.
//
// Privacy rule for everything sent to Sentry: ids and codes only. Never a
// prayer request, a note, a name, an email address, or a sign-in code. See
// docs/superpowers/plans/2026-10-01-06-error-monitoring.md, "Decisions".

// Sentry v11 collects cookies, HTTP bodies, user info, and database query
// data unless told otherwise. These are the v10 defaults, copied from Sentry's
// v10→v11 migration guide.
const DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
    response: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
  },
  httpBodies: [],
  urlQueryParams: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
};

// Drizzle's DrizzleQueryError message ends "\nparams: <every bound value>",
// and those values are whatever was being written: a prayer request, a note.
// Keep the query, which says what failed, and drop the values.
const QUERY_PARAMS = /\nparams: [\s\S]*$/;

function scrubText(text: string): string {
  return text.replace(QUERY_PARAMS, "\nparams: [scrubbed]");
}

export function scrubEvent(event: ErrorEvent, hint: EventHint): ErrorEvent {
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubText(exception.value);
  }
  if (event.message) event.message = scrubText(event.message);
  for (const breadcrumb of event.breadcrumbs ?? []) {
    if (breadcrumb.message) breadcrumb.message = scrubText(breadcrumb.message);
    // A console breadcrumb keeps the raw arguments that were logged (Better
    // Auth logs a failed email send with its error), unscrubbed. The message
    // above already says what was logged.
    if (breadcrumb.category === "console") delete breadcrumb.data;
  }
  // dataCollection already keeps these out. This makes sure.
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
  }
  // Next.js gives each server error a digest and sends only that digest to
  // the browser. Tagging the server's event with it lets the error screen's
  // event (tagged with the same digest) lead straight here.
  const original = hint.originalException;
  if (typeof original === "object" && original !== null && "digest" in original) {
    if (typeof original.digest === "string") event.tags = { ...event.tags, digest: original.digest };
  }
  return event;
}

export function sharedSentryOptions() {
  return {
    // Read straight from process.env, not src/lib/env.ts: that module holds
    // server secrets and must never reach the browser, and Next only inlines a
    // NEXT_PUBLIC_ variable into the browser bundle when it's written out like
    // this. Unset locally and in e2e, which turns the SDK off.
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "local",
    dataCollection: DATA_COLLECTION,
    beforeSend: scrubEvent,
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run (sandbox override): `pnpm vitest run src/lib/sentry-config.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Prove the scrub test can fail**

Temporarily change the exception loop's body to `if (exception.value) exception.value = exception.value;`. Run the file again.
Expected: "keeps the failed query but drops the values…" and "scrubs a linked cause…" FAIL (the output contains "surgery"). Restore `scrubText(exception.value)` and re-run to PASS. Note the observed failure in the commit message body.

- [ ] **Step 7: Initialize Sentry on the server**

`src/instrumentation.ts`:

```ts
import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions } from "@/lib/sentry-config";

export function register() {
  // Next 16's proxy runs on Node, and nothing in this app opts into the edge
  // runtime, so Node is the only server runtime to set up.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      ...sharedSentryOptions(),
      // The default, spelled out: a stack frame's local variables could hold
      // anything the request was handling.
      includeLocalVariables: false,
    });
  }
}

// Server components, server actions, and route handlers. Next calls this with
// every error it catches while handling a request.
export const onRequestError = Sentry.captureRequestError;
```

- [ ] **Step 8: Initialize Sentry in the browser, with the replay buffer**

`src/instrumentation-client.ts`:

```ts
import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions } from "@/lib/sentry-config";

Sentry.init({
  ...sharedSentryOptions(),
  integrations: [
    Sentry.replayIntegration({
      // Sentry's defaults, spelled out so a future default can't loosen them.
      // Prayer requests and notes are on these screens: a replay shows the
      // layout and the taps, never the words.
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
      networkDetailAllowUrls: [],
    }),
  ],
  // Never record whole sessions. Keep the last minute in memory and upload it
  // only when an error happens or "Report a problem" opens
  // (src/lib/problem-report.ts).
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
});
```

- [ ] **Step 9: Wrap the Next config**

Replace `next.config.ts` with:

```ts
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(withSerwist(nextConfig), {
  // From Vercel's environment (see .env.example). A build without them, local
  // or e2e, still works; it just uploads no source maps.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  widenClientFileUpload: true,
  silent: !process.env.CI,
  // Browser events post here, on the app's own domain, and Next forwards them
  // to Sentry. Ad blockers drop requests that go to sentry.io directly.
  tunnelRoute: "/monitoring",
});
```

If `typecheck` later reports that `@sentry/nextjs/config` can't be found, the installed version exports `withSentryConfig` from the package root: import it from `"@sentry/nextjs"` instead and say so in the commit body.

- [ ] **Step 10: Keep the proxy out of the tunnel**

In `src/proxy.ts`, replace the `config` export with:

```ts
export const config = {
  // `monitoring` is Sentry's tunnel (next.config.ts). Sentry's docs ask that a
  // proxy stay out of it so browser reports pass straight through.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|monitoring).*)"],
};
```

- [ ] **Step 11: Document the variables**

Append to `.env.example`:

```
# Error monitoring (Sentry). Leave unset locally: the SDK stays off without a DSN.
# Never put the DSN in .env or .env.local: `next build` inlines it, and every
# e2e run would then report to the real Sentry project.
# NEXT_PUBLIC_SENTRY_DSN=
# Build time only (set in Vercel), for uploading source maps:
# SENTRY_AUTH_TOKEN=
# SENTRY_ORG=
# SENTRY_PROJECT=
```

- [ ] **Step 12: Full gate, including the build and e2e**

Run (sandbox override): `mise run lint && mise run typecheck && mise run test && mise run build && CI=1 mise run e2e`
Expected: all green. The build has no DSN or token, so Sentry is inactive and uploads nothing. If Sentry's build output warns about a missing `onRouterTransitionStart` export, leave it: that hook is for navigation tracing, which this plan leaves off.

If `typecheck` reports `ErrorEvent` or `EventHint` missing from `@sentry/nextjs`, stop: the installed SDK isn't the v11 these decisions were made against. Report the installed version (`pnpm list @sentry/nextjs`) to the owner instead of working around it.

- [ ] **Step 13: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/sentry-config.ts src/lib/sentry-config.test.ts src/instrumentation.ts src/instrumentation-client.ts next.config.ts src/proxy.ts .env.example
git commit -m "Add Sentry with privacy-first options"
```

---

### Task 2: Record the failures that don't throw

**Files:**
- Create: `src/lib/monitoring.ts`
- Test: `src/lib/monitoring.test.ts`
- Modify: `src/lib/auth-email.ts`, `src/lib/auth-email.test.ts`
- Modify: `src/lib/dal.ts` (`requireUser` tells Sentry who the request is for)
- Modify: `src/app/(app)/group/actions.ts`, `meals/actions.ts`, `meetings/actions.ts`, `prayers/actions.ts`, `recipes/actions.ts`, `join/actions.ts`, and `notes/actions.ts` **if it exists**

**Interfaces:**
- Consumes: the initialized server SDK (Task 1). Without a DSN these calls are no-ops.
- Produces (`src/lib/monitoring.ts`, server only):
  - `logRefusal(err: unknown): void`. Logs `"Action refused"` with `{ reason }` when `err` is an `Error` whose message is a kebab-case refusal code; otherwise does nothing.
  - `logEmailSent(resendId: string): void`. Logs `"Sign-in code email sent"` with `{ resendId }`.
  - `reportEmailFailure(err: unknown): void`. Captures `err` as an error tagged `area: "sign-in-email"`.
- `requireUser()` sets the Sentry user to `{ id }` for the rest of the request, so every server error and log carries it.

- [ ] **Step 1: Write the failing monitoring tests**

`src/lib/monitoring.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  logger: { info: vi.fn(), warn: vi.fn() },
  captureException: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => sentry);

import { logEmailSent, logRefusal, reportEmailFailure } from "./monitoring";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("logRefusal", () => {
  it("logs a domain refusal by its code", () => {
    logRefusal(new Error("session-closed"));
    expect(sentry.logger.warn).toHaveBeenCalledWith("Action refused", { reason: "session-closed" });
  });

  it("skips anything that isn't a refusal code, since real faults are captured as errors", () => {
    logRefusal(new Error('Failed query: insert into "notes" ("body") values ($1)\nparams: my private note'));
    logRefusal(new Error("Something broke"));
    logRefusal("forbidden");
    expect(sentry.logger.warn).not.toHaveBeenCalled();
  });
});

describe("sign-in email records", () => {
  it("logs an accepted send by Resend's id only", () => {
    logEmailSent("em_123");
    expect(sentry.logger.info).toHaveBeenCalledWith("Sign-in code email sent", { resendId: "em_123" });
  });

  it("captures a failed send as an error, so it opens an issue and emails the owner", () => {
    const err = new Error("Resend refused the sign-in email: daily_quota_exceeded");
    reportEmailFailure(err);
    expect(sentry.captureException).toHaveBeenCalledWith(err, { tags: { area: "sign-in-email" } });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run (sandbox override): `pnpm vitest run src/lib/monitoring.test.ts`
Expected: FAIL. `./monitoring` can't be resolved.

- [ ] **Step 3: Write the module**

`src/lib/monitoring.ts`:

```ts
import * as Sentry from "@sentry/nextjs";

// Server-side records of what goes wrong without throwing, so that "it said I
// couldn't" or "my code never came" has something behind it in Sentry.
// Ids and codes only: never a prayer request, a note, a name, an email
// address, or a sign-in code (see src/lib/sentry-config.ts).

// The domain modules refuse with short kebab-case codes ("forbidden",
// "not-found", "session-closed", ...). Anything else is a real fault: the
// action rethrows it and Sentry captures it as an error, so it isn't logged
// here as well.
const REFUSAL_CODE = /^[a-z]+(-[a-z]+)*$/;

// First thing in an action's refusal mapping. The log carries the signed-in
// user's id (requireUser sets it), so a member's report can be matched to what
// the server refused them.
export function logRefusal(err: unknown) {
  if (err instanceof Error && REFUSAL_CODE.test(err.message)) {
    Sentry.logger.warn("Action refused", { reason: err.message });
  }
}

export function logEmailSent(resendId: string) {
  Sentry.logger.info("Sign-in code email sent", { resendId });
}

// A sign-in code that never left means someone can't get in. Captured as an
// error, not a log, so it opens an issue and emails the owner.
export function reportEmailFailure(err: unknown) {
  Sentry.captureException(err, { tags: { area: "sign-in-email" } });
}
```

- [ ] **Step 4: Run them to verify they pass**

Run (sandbox override): `pnpm vitest run src/lib/monitoring.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing email tests**

`auth-email.ts` reads `env` from `src/lib/env.ts`, which parses `process.env` once, when the module loads. `vi.stubEnv` can't reach it, so the test mocks the module instead.

In `src/lib/auth-email.test.ts`, replace the first two import lines with:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));
const monitoring = vi.hoisted(() => ({ logEmailSent: vi.fn(), reportEmailFailure: vi.fn() }));
vi.mock("@/lib/monitoring", () => monitoring);
// Only RESEND_API_KEY set, so sendAuthEmail takes the Resend path. The
// pickTransport tests pass their own values and never read this.
vi.mock("@/lib/env", () => ({ env: { RESEND_API_KEY: "re_test" } }));

import { pickTransport, sendAuthEmail, signInEmail } from "./auth-email";
```

and append:

```ts
describe("sendAuthEmail through Resend", () => {
  const message = { to: "ruth@example.com", otp: "482913" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs Resend's id when the email is accepted", async () => {
    send.mockResolvedValue({ data: { id: "em_123" }, error: null, headers: null });
    await sendAuthEmail(message);
    expect(monitoring.logEmailSent).toHaveBeenCalledWith("em_123");
    expect(monitoring.reportEmailFailure).not.toHaveBeenCalled();
  });

  it("reports and throws when Resend refuses, which it says by returning an error, not throwing", async () => {
    send.mockResolvedValue({
      data: null,
      // Resend's message can echo the address back; only its name may leave.
      error: { name: "validation_error", message: "Invalid `to`: ruth@example.com", statusCode: 422 },
      headers: null,
    });
    await expect(sendAuthEmail(message)).rejects.toThrow(
      "Resend refused the sign-in email: validation_error",
    );
    expect(monitoring.reportEmailFailure).toHaveBeenCalledOnce();
    const [reported] = monitoring.reportEmailFailure.mock.calls[0];
    expect(String(reported)).not.toContain("ruth@example.com");
    expect(String(reported)).not.toContain("482913");
    expect(monitoring.logEmailSent).not.toHaveBeenCalled();
  });

  it("reports and rethrows when the request to Resend fails outright", async () => {
    send.mockRejectedValue(new Error("fetch failed"));
    await expect(sendAuthEmail(message)).rejects.toThrow("fetch failed");
    expect(monitoring.reportEmailFailure).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 6: Run them to verify they fail**

Run (sandbox override): `pnpm vitest run src/lib/auth-email.test.ts`
Expected: the six existing tests PASS. "logs Resend's id…" FAILS (`logEmailSent` never called). "reports and throws…" FAILS (the promise resolves, since today's code ignores Resend's `error`). "reports and rethrows…" FAILS (`reportEmailFailure` never called).

- [ ] **Step 7: Check Resend's answer**

In `src/lib/auth-email.ts`, add `import { logEmailSent, reportEmailFailure } from "@/lib/monitoring";` below the `resend` import, and replace the `if (mode === "resend") { … }` block with:

```ts
  if (mode === "resend") {
    // AUTH_EMAIL_FROM must be on a Resend-verified domain (send.sameermall.com
    // in prod). The resend.dev fallback is test mode: owner's inbox only.
    const resend = new Resend(env.RESEND_API_KEY);
    try {
      const result = await resend.emails.send({
        from: env.AUTH_EMAIL_FROM ?? "Small Group <onboarding@resend.dev>",
        to,
        ...signInEmail(otp),
      });
      // Resend reports a refused send (quota, rate limit, unverified sender)
      // in its return value; it doesn't throw. Its message can echo the
      // address back, so only the error's name goes into ours.
      if (result.error) throw new Error(`Resend refused the sign-in email: ${result.error.name}`);
      logEmailSent(result.data.id);
    } catch (err) {
      // Better Auth catches whatever this throws and only console-logs it, and
      // the sign-in screen still says the code is on its way. Reporting here is
      // how anyone finds out.
      reportEmailFailure(err);
      throw err;
    }
    return;
  }
```

- [ ] **Step 8: Run them to verify they pass**

Run (sandbox override): `pnpm vitest run src/lib/auth-email.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 9: Prove the refusal test can fail**

Temporarily delete the `if (result.error) throw …` line. Run the file.
Expected: "reports and throws when Resend refuses…" FAILS. This is today's behavior, where a refused send looks like a success. Restore the line and re-run to PASS. Note it in the commit body.

- [ ] **Step 10: Log every refusal an action shows**

In each of these files add `import { logRefusal } from "@/lib/monitoring";` with the other `@/lib` imports, then make `logRefusal(err);` the **first statement** of its `mapError` function:

- `src/app/(app)/group/actions.ts`
- `src/app/(app)/meals/actions.ts`
- `src/app/(app)/meetings/actions.ts`
- `src/app/(app)/prayers/actions.ts` (`refused()` calls `mapError`, so its four actions are covered)
- `src/app/(app)/recipes/actions.ts`

For example, `src/app/(app)/recipes/actions.ts` becomes:

```ts
function mapError(err: unknown): string {
  logRefusal(err);
  if (err instanceof Error) {
    if (err.message === "forbidden") {
      return "Only group members can do that.";
    }
    if (err.message === "not-found") {
      return "That didn't work. Try refreshing the page.";
    }
  }
  throw err;
}
```

In `src/app/(app)/join/actions.ts`, which has no `mapError`, make `logRefusal(err);` the first statement of the `catch (err)` block.

**If `src/app/(app)/notes/actions.ts` exists** (plan 5 merged): make `logRefusal(err);` the first statement of each of its `catch (err)` blocks. Leave `isRefusal` as it is.

- [ ] **Step 11: Tell Sentry who each request is for**

In `src/lib/dal.ts`, add `import * as Sentry from "@sentry/nextjs";` to the imports. In `requireUser`, directly after the `if (!session) { … }` block, add:

```ts
  // Every server error and log from here to the end of this request carries
  // who it happened to, by id only (src/lib/sentry-config.ts). Set before the
  // /welcome redirect so a new member's first steps are covered too.
  Sentry.setUser({ id: session.user.id });
```

- [ ] **Step 12: Full gate, then commit**

Run (sandbox override): `mise run lint && mise run typecheck && mise run test && mise run build`
Expected: all green.

```bash
git add src/lib/monitoring.ts src/lib/monitoring.test.ts src/lib/auth-email.ts src/lib/auth-email.test.ts src/lib/dal.ts "src/app/(app)"
git commit -m "Record refused actions and failed sign-in emails in Sentry"
```

---

### Task 3: Report a problem

**Files:**
- Create: `src/lib/problem-report.ts`
- Test: `src/lib/problem-report.test.ts`
- Create: `src/components/sentry-user.tsx`, `src/components/report-problem-dialog.tsx`
- Modify: `src/app/(app)/layout.tsx`, `src/components/sign-out-button.tsx`, `src/app/(app)/group/page.tsx`
- Test: `e2e/report-problem.spec.ts`

**Interfaces:**
- Consumes: the browser SDK and its replay buffer (Task 1).
- Produces (`src/lib/problem-report.ts`, browser only):
  - `identifyUser(user: { id: string; name: string; email: string }): void`. Sets the Sentry user to `{ id }` and remembers name and email, for reports only.
  - `forgetUser(): void`. Clears both (sign-out).
  - `startProblemReport(): void`. Uploads the replay buffer now. Call it when the report form opens.
  - `sendProblemReport(message: string, associatedEventId?: string): void`. Sends the report with the replay, plus name and email if known.
- Produces (components):
  - `SentryUser({ id, name, email })`, rendered once in the app layout.
  - `ReportProblemDialog({ label, look, getAssociatedEventId? }: { label: string; look: "link" | "button"; getAssociatedEventId?: () => string | undefined })`. Task 4's error screen uses it with `look="button"`.
  - Task 4 and the e2e test rely on: the field's label **"What happened?"**, the submit button **"Send report"** (disabled while the field is blank), and the confirmation **"Thanks for letting us know"** with a **"Done"** button.

- [ ] **Step 1: Write the failing tests**

`src/lib/problem-report.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => {
  const replay = { flush: vi.fn(() => Promise.resolve()) };
  return {
    replay,
    setUser: vi.fn(),
    getReplay: vi.fn(() => replay as typeof replay | undefined),
    captureFeedback: vi.fn(),
  };
});
vi.mock("@sentry/nextjs", () => sentry);

import { forgetUser, identifyUser, sendProblemReport, startProblemReport } from "./problem-report";

const ruth = { id: "u_ruth", name: "Ruth", email: "ruth@example.com" };

beforeEach(() => {
  forgetUser();
  vi.clearAllMocks();
});

describe("identity", () => {
  it("tells Sentry only the user's id", () => {
    identifyUser(ruth);
    expect(sentry.setUser).toHaveBeenCalledWith({ id: "u_ruth" });
  });

  it("forgets the user, name and email included, on sign-out", () => {
    identifyUser(ruth);
    forgetUser();
    expect(sentry.setUser).toHaveBeenLastCalledWith(null);
    sendProblemReport("Still broken");
    expect(sentry.captureFeedback).toHaveBeenCalledWith(
      { message: "Still broken" },
      { includeReplay: true },
    );
  });
});

describe("problem reports", () => {
  it("carry the message, the reporter's name and email, and the replay", () => {
    identifyUser(ruth);
    sendProblemReport("The meal list didn't load.");
    expect(sentry.captureFeedback).toHaveBeenCalledWith(
      { message: "The meal list didn't load.", name: "Ruth", email: "ruth@example.com" },
      { includeReplay: true },
    );
  });

  it("link to the error they were sent from", () => {
    sendProblemReport("Got the error screen", "evt_123");
    expect(sentry.captureFeedback).toHaveBeenCalledWith(
      { message: "Got the error screen", associatedEventId: "evt_123" },
      { includeReplay: true },
    );
  });

  it("upload the replay buffer as soon as the form opens, before the typing", () => {
    startProblemReport();
    expect(sentry.replay.flush).toHaveBeenCalledOnce();
  });

  it("open fine when no replay is running (no DSN)", () => {
    sentry.getReplay.mockReturnValueOnce(undefined);
    expect(() => startProblemReport()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run (sandbox override): `pnpm vitest run src/lib/problem-report.test.ts`
Expected: FAIL. `./problem-report` can't be resolved.

- [ ] **Step 3: Write the module**

`src/lib/problem-report.ts`:

```ts
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
```

- [ ] **Step 4: Run them to verify they pass**

Run (sandbox override): `pnpm vitest run src/lib/problem-report.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Prove the replay test can fail**

Temporarily change the second argument of `captureFeedback` to `{}`. Run the file.
Expected: the three tests asserting `{ includeReplay: true }` FAIL. Restore `{ includeReplay: true }` and re-run to PASS. Note it in the commit body.

- [ ] **Step 6: Tell the browser who is signed in**

`src/components/sentry-user.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { identifyUser } from "@/lib/problem-report";

// Tells the browser's Sentry who is signed in, so errors and reports from this
// device can be matched to them. Renders nothing.
export function SentryUser({ id, name, email }: { id: string; name: string; email: string }) {
  useEffect(() => {
    identifyUser({ id, name, email });
  }, [id, name, email]);
  return null;
}
```

In `src/app/(app)/layout.tsx`, import it, change `await requireUser();` to `const user = await requireUser();`, and render it as the first child of the outer `<div>`:

```tsx
      <SentryUser id={user.id} name={user.name} email={user.email} />
```

In `src/components/sign-out-button.tsx`, import `forgetUser` from `@/lib/problem-report` and call it right after `await authClient.signOut();`:

```tsx
    await authClient.signOut();
    // The next person on this device mustn't inherit this one's identity in
    // error reports.
    forgetUser();
```

- [ ] **Step 7: Write the failing e2e test**

`e2e/report-problem.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { expectApp, memberContext, signIn } from "./helpers";

test("a member reports a problem from the Group tab", async ({ browser }) => {
  const run = Date.now();
  const page = await (await memberContext(browser)).newPage();
  await signIn(page, `reporter-${run}@example.com`, "Reporter");
  await page.getByRole("link", { name: "Create a group" }).click();
  await page.getByLabel("Group name").fill(`Reports ${run}`);
  await page.getByRole("button", { name: "Create group" }).click();
  await expectApp(page.getByText(`Reports ${run}`)).toBeVisible();

  await page.getByRole("link", { name: "Group" }).click();
  await page.getByRole("button", { name: "Report a problem" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Send report" })).toBeDisabled();

  await dialog.getByLabel("What happened?").fill("The meal list didn't load.");
  await dialog.getByRole("button", { name: "Send report" }).click();
  await expect(dialog.getByText("Thanks for letting us know")).toBeVisible();

  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
});
```

Run (sandbox override): `mise run build && CI=1 pnpm playwright test e2e/report-problem.spec.ts`
Expected: FAIL. No "Report a problem" button on the Group tab.

- [ ] **Step 8: Build the dialog**

`src/components/report-problem-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { sendProblemReport, startProblemReport } from "@/lib/problem-report";

// The report goes straight from the browser to Sentry. The cap only keeps one
// report to a readable length.
const MAX_REPORT_LENGTH = 2000;

export function ReportProblemDialog({
  label,
  look,
  getAssociatedEventId,
}: {
  label: string;
  // "link" sits quietly on the Group tab; "button" is the error screen's
  // second action, under "Try again".
  look: "link" | "button";
  // The error screen passes the id of the error it just reported, so the
  // report shows up on that error in Sentry.
  getAssociatedEventId?: () => string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      startProblemReport();
    } else {
      setMessage("");
      setSent(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;
    sendProblemReport(trimmed, getAssociatedEventId?.());
    setSent(true);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {look === "link" ? (
        <DialogTrigger className="text-accent-strong min-h-tap text-sm font-semibold">
          {label}
        </DialogTrigger>
      ) : (
        <DialogTrigger
          render={<Button type="button" variant="outline" size="lg" className="min-h-tap w-full" />}
        >
          {label}
        </DialogTrigger>
      )}
      <DialogContent>
        {sent ? (
          <>
            <DialogHeader>
              <DialogTitle>Thanks for letting us know</DialogTitle>
              <DialogDescription>Your report was sent.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button type="button" />}>Done</DialogClose>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Report a problem</DialogTitle>
              <DialogDescription>
                Tell us what you were trying to do and what went wrong. Your report also includes a
                recording of the last minute on your screen, with all text hidden.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="problem-report" className="text-strong text-sm font-medium">
                What happened?
              </label>
              <textarea
                id="problem-report"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={MAX_REPORT_LENGTH}
                rows={4}
                // ≥16px stops iOS zooming on focus (parent spec, Mobile-first).
                className="bg-background border-border focus:border-primary rounded-input w-full resize-none border-[1.5px] px-4 py-3 text-[16px] leading-[1.5] outline-none"
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
              <Button type="submit" disabled={!message.trim()}>
                Send report
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 9: Put it on the Group tab**

In `src/app/(app)/group/page.tsx`, import `ReportProblemDialog` from `@/components/report-problem-dialog`, and replace

```tsx
      <div className="flex justify-center pb-4">
        <SignOutButton />
      </div>
```

with

```tsx
      <div className="flex flex-col items-center gap-2 pb-4">
        <ReportProblemDialog label="Report a problem" look="link" />
        <SignOutButton />
      </div>
```

- [ ] **Step 10: Run the e2e test to verify it passes**

Run (sandbox override): `mise run build && CI=1 pnpm playwright test e2e/report-problem.spec.ts`
Expected: PASS.

- [ ] **Step 11: Gate**

Run (sandbox override): `mise run lint && mise run typecheck && mise run test && mise run build && CI=1 mise run e2e`
Expected: all green.

- [ ] **Step 12: Verify in the browser at 390×844**

Start `web-start` (port 3200; no DSN, so nothing is sent), sign in through the mail sink, create a group, open the Group tab. Check and record each:

1. "Report a problem" sits above "Sign out", centered, in `text-accent-strong`, with a tap target at least `min-h-tap` tall.
2. Tapping it opens the dialog with the exact copy from Global Constraints. "Send report" is disabled until something other than spaces is typed.
3. The field's computed font size is 16px. Focusing it on a 390-wide viewport doesn't zoom or push the dialog off screen, and the page has no horizontal overflow.
4. Send: the dialog shows "Thanks for letting us know" and "Your report was sent." "Done" closes it. Reopening shows an empty form.
5. Cancel and the close gesture both close without sending. Reopening shows an empty form.
6. Dark mode (`prefers-color-scheme: dark`): the dialog and field use the warm brown theme, with no gray or black.
7. The browser console shows no errors from Sentry or React.

- [ ] **Step 13: Commit**

```bash
git add src/lib/problem-report.ts src/lib/problem-report.test.ts src/components/sentry-user.tsx src/components/report-problem-dialog.tsx "src/app/(app)/layout.tsx" src/components/sign-out-button.tsx "src/app/(app)/group/page.tsx" e2e/report-problem.spec.ts
git commit -m "Add Report a problem, with a replay of the minute before"
```

---

### Task 4: Error screens with a reference code

**Files:**
- Modify: `src/lib/problem-report.ts` (add `makeReference`), `src/lib/problem-report.test.ts`
- Create: `src/components/error-screen.tsx`
- Create: `src/app/error.tsx`, `src/app/(app)/error.tsx`, `src/app/global-error.tsx`

**Interfaces:**
- Consumes: `ReportProblemDialog` (Task 3); `scrubEvent`'s server-side `digest` tag (Task 1).
- Produces:
  - `makeReference(): string`. Six characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`.
  - `ErrorScreen({ error, retry }: { error: Error & { digest?: string }; retry: () => void })`. Reports the error tagged `ref` (and `digest` when the error came from the server), and shows the reference, "Try again", and "Report this problem".

- [ ] **Step 1: Write the failing tests**

In `src/lib/problem-report.test.ts`, add `makeReference` to the `./problem-report` import, and append:

```ts
describe("makeReference", () => {
  it("is six characters that survive being read aloud or retyped (no 0/O, 1/I/L)", () => {
    for (let i = 0; i < 500; i++) {
      expect(makeReference()).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
    }
  });

  it("is different every time", () => {
    const references = new Set(Array.from({ length: 100 }, makeReference));
    expect(references.size).toBe(100);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run (sandbox override): `pnpm vitest run src/lib/problem-report.test.ts`
Expected: FAIL. `makeReference` is not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/problem-report.ts`:

```ts
// No 0/O or 1/I/L: a member reads this off their screen and says or texts it.
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

// The code an error screen shows. It goes to Sentry as the `ref` tag, so
// searching `ref:<code>` finds the exact event.
export function makeReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length]).join("");
}
```

- [ ] **Step 4: Run them to verify they pass**

Run (sandbox override): `pnpm vitest run src/lib/problem-report.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: The screen**

`src/components/error-screen.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { ReportProblemDialog } from "@/components/report-problem-dialog";
import { makeReference } from "@/lib/problem-report";

// What every error boundary shows (src/app/error.tsx, src/app/(app)/error.tsx,
// src/app/global-error.tsx). It reports the error tagged with a short
// reference the member can read out or text, so their "it broke" finds this
// exact event: search `ref:<code>` in Sentry.
export function ErrorScreen({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const [reference] = useState(makeReference);
  // Read when a report is sent, never during render.
  const eventId = useRef<string | undefined>(undefined);

  useEffect(() => {
    eventId.current = Sentry.captureException(
      error,
      error.digest
        ? {
            tags: { ref: reference, digest: error.digest },
            // A server error was already captured in full by onRequestError,
            // tagged with this same digest (src/lib/sentry-config.ts). The
            // browser only gets a generic stand-in, so these all group into
            // one issue rather than a duplicate per error; the digest leads
            // to the server's issue, which has the real stack.
            fingerprint: ["error-screen", "server-error"],
          }
        : { tags: { ref: reference } },
    );
  }, [error, reference]);

  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center p-6">
      <div className="bg-card rounded-card shadow-card flex w-full max-w-sm flex-col gap-4 p-6 text-center">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-xl font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground text-sm">
            Try again. If it keeps happening, report it so we can fix it.
          </p>
        </div>
        <p className="text-tertiary text-xs">
          Reference{" "}
          <span className="text-strong font-semibold tracking-[0.2em] tabular-nums">{reference}</span>
        </p>
        <Button type="button" size="lg" className="min-h-tap w-full font-bold" onClick={() => retry()}>
          Try again
        </Button>
        <ReportProblemDialog
          label="Report this problem"
          look="button"
          getAssociatedEventId={() => eventId.current}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 6: The boundaries**

`src/app/(app)/error.tsx`, the error inside the app, under its layout so the tab bar stays and the member can move on:

```tsx
"use client";

import { ErrorScreen } from "@/components/error-screen";

export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <ErrorScreen error={error} retry={unstable_retry} />;
}
```

`src/app/error.tsx`, for sign-in and welcome, and for the app layout itself failing:

```tsx
"use client";

import { ErrorScreen } from "@/components/error-screen";

export default function RootError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <ErrorScreen error={error} retry={unstable_retry} />;
}
```

`src/app/global-error.tsx`, for the root layout failing. It replaces that layout, so it brings its own `<html>`, `<body>`, and styles. The fonts stay with the root layout; headings fall back to the system serif here.

```tsx
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
```

- [ ] **Step 7: Gate**

Run (sandbox override): `mise run lint && mise run typecheck && mise run test && mise run build && CI=1 mise run e2e`
Expected: all green.

- [ ] **Step 8: Verify in the browser at 390×844**

Temporarily make a page throw. In `src/app/(app)/recipes/page.tsx`, make the first line of the page function `throw new Error("error screen check");`. Run `mise run build`, start `web-start` (no DSN), sign in, and open the Recipes tab. Check and record each:

1. The error screen shows inside the app: the tab bar is still there, with a centered card reading the exact copy from Global Constraints and a six-character reference in the unambiguous alphabet.
2. The browser console has no hydration-mismatch warning. If one names the reference text, stop and report it to the owner. Don't paper over it with `suppressHydrationWarning`: the code shown and the code sent would then differ.
3. "Try again" re-renders the segment and shows the error screen again (the throw is still there), with a new reference.
4. "Report this problem" opens the Task 3 dialog. The page's "Send report" works and shows "Thanks for letting us know".
5. Tapping the Meetings tab leaves the error behind and loads normally.
6. Dark mode: the card is warm brown, with no gray or black.

Then remove the throw (`git checkout -- "src/app/(app)/recipes/page.tsx"`) and confirm `git status` no longer lists that file.

- [ ] **Step 9: Commit**

```bash
git add src/lib/problem-report.ts src/lib/problem-report.test.ts src/components/error-screen.tsx src/app/error.tsx "src/app/(app)/error.tsx" src/app/global-error.tsx
git commit -m "Add error screens with a reference code"
```

---

### Task 5: Prove it end to end, document it, and open the PR

Needs the **Owner setup** above. If the owner hasn't given a DSN yet, ask for one and wait.

**Files:**
- Modify: `README.md` (an "Error monitoring" section), `CLAUDE.md` (one convention line)

- [ ] **Step 1: Build locally against the real project**

Run (sandbox override), with the DSN on the command line only and never written to a file:
`NEXT_PUBLIC_SENTRY_DSN='<dsn from the owner>' mise run build`

Start `web-start` (3200), sign in through the mail sink, and create a group and a meeting dated today. Resize to 390×844.

`next build` inlines `NEXT_PUBLIC_` variables into the server bundle as well. If browser events arrive in the steps below but server events don't, the server isn't seeing the DSN: add the DSN to `.env.local` for this check only, and remove it before Step 6.

- [ ] **Step 2: Plant content that must never leave**

On the meeting, join the prayer bowl and submit the request `VERIFY-PRAYER-7731 please keep this private`. If notes exist (plan 5), type `VERIFY-NOTE-7731` in My note.

- [ ] **Step 3: Check a report from the Group tab**

Tap through a few screens, then open Group → "Report a problem" and send `VERIFY-REPORT-7731 checking reports`. In Sentry (UI, or the MCP if it's the personal org; see Machine notes), check and record:

1. The report is under User Feedback, with your name and email, environment `local`, and a replay.
2. The replay shows the screens you tapped through before opening the form. Every piece of text is masked (asterisks or blocks), including the prayer bowl.
3. The browser's request to Sentry went to `/monitoring` on localhost (Network panel or `read_network_requests` with `monitoring`), not to `sentry.io`.

- [ ] **Step 4: Check an error screen, end to end**

Add the same temporary throw as Task 4 Step 8, rebuild **with** the DSN, open Recipes, and note the reference. Then check and record:

1. Searching Sentry Issues for `ref:<reference>` finds the browser event. It is tagged `ref` and `digest`, its user shows **only an id** (no email, no IP address), and it has a replay.
2. Searching `digest:<that digest>` finds the server issue, with the real message `error screen check` and a stack through the recipes page.
3. "Report this problem" on the error screen sends a report that appears on that error in Sentry (the feedback is linked to the event).

Remove the throw (`git checkout -- "src/app/(app)/recipes/page.tsx"`), confirm with `git status`, and rebuild with the DSN.

- [ ] **Step 5: Check a refusal log and the privacy promises**

1. Create a recipe and open its edit page. In a second tab, delete it. Back in the first tab, save. The page says "That didn't work. Try refreshing the page." In Sentry Logs, an `Action refused` entry has `reason` `not-found` and your user id.
2. Search all of Sentry (Issues, User Feedback, Logs) for `VERIFY-PRAYER-7731` and `VERIFY-NOTE-7731`. Nothing comes up.
3. Open the server event from Step 4: its request section has no cookies, no `cookie` or `x-forwarded-for` header, and no body.

The failed-email path is proven by Task 2's unit tests. Don't break the real Resend configuration to see it live.

- [ ] **Step 6: Leave no DSN behind**

Remove the DSN from `.env.local` if Step 1 needed it there. Rebuild without it (`mise run build`) so later e2e runs report nothing, and run `grep -r "ingest" .env* ; git status` to confirm no file holds the DSN.

- [ ] **Step 7: Document how to look things up**

Add to `README.md`, after the sign-in paragraph:

```markdown
## Error monitoring

Errors, problem reports, and a few logs go to Sentry (personal account, free plan). Setup and decisions: `docs/superpowers/plans/2026-10-01-06-error-monitoring.md`. Sentry is off unless `NEXT_PUBLIC_SENTRY_DSN` is set, which only Vercel does. Never put it in `.env` or `.env.local`.

When someone reports a problem:

- **They sent a reference code** (from an error screen): search Sentry Issues for `ref:<code>`. The event has a replay. If it has a `digest` tag, search `digest:<value>` for the server's issue with the full stack.
- **They used Report a problem** (Group tab): it's under User Feedback, with their message, name, email, a replay of the minute before, and their user id. Search Issues and Logs by that id.
- **"My code never came":** a refused send is an issue (and an email to you) tagged `area:sign-in-email`. Each accepted send is a log, `Sign-in code email sent`, with Resend's id; delivery status is in the Resend dashboard.
- **"It said I couldn't do that":** Logs, `Action refused`, filtered by their user id. `reason` is the refusal code.

Every event carries the user's id only. A replay masks all text. Nothing sent to Sentry may contain prayer requests, notes, names, emails, or codes. The one exception is a report the member writes themselves.
```

Add to `CLAUDE.md`, under Conventions:

```markdown
- Monitoring: Sentry, configured in `src/lib/sentry-config.ts` (plan 6). Nothing sent to Sentry may contain user content (prayer requests, notes, names, emails, sign-in codes): ids and codes only. Server action files call `logRefusal(err)` (`src/lib/monitoring.ts`) first thing in their refusal mapping.
```

- [ ] **Step 8: Full gate, then commit**

Run (sandbox override): `mise run lint && mise run typecheck && mise run test && mise run build && CI=1 mise run e2e`
Expected: all green.

```bash
git add README.md CLAUDE.md
git commit -m "Document error monitoring"
```

- [ ] **Step 9: Push and open the PR**

Run (sandbox override, after `gh auth switch --user sameer-mall`): `git push -u origin feat/error-monitoring`, then `gh pr create --base main --title "Add error monitoring with Sentry (plan 6)"`. The body summarizes the Decisions, lists the Owner setup steps (so the owner can confirm the Vercel variables exist for Production and Preview), and includes the post-merge check from Step 10.

- [ ] **Step 10: Check the preview, and hand over the post-merge check**

On the PR's Vercel preview (it needs a Vercel login; ask the owner, or use Claude in Chrome with their permission):

1. The build log shows Sentry uploading source maps. If it shows none, the `SENTRY_*` variables aren't set for Preview: tell the owner, and don't treat it as a code failure.
2. Send a report from the Group tab. It appears in Sentry with environment `preview`.

Tell the owner, for after merging: sign in to production once. In Sentry Logs, a `Sign-in code email sent` entry with a `resendId` and environment `production` should appear within a minute. That proves logs flush from Vercel's functions. If it doesn't appear, that's the first thing to look at.

The PR stops here. The owner merges.
