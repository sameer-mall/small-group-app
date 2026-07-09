# Auth & Groups Implementation Plan (Plan 2 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sign-in (Google + magic link), multi-group membership on Better Auth's organization plugin, invite-link joining with admin approval, a group admin screen, and Neon serving production — the app's entire auth/tenancy layer.

**Architecture:** Better Auth runs as a library inside Next.js (route handler at `/api/auth/[...all]`), storing users/sessions/organizations in our Postgres via the Drizzle adapter. Organizations = groups with roles `admin`/`member` (creator becomes admin). Our own tables (`join_requests`, `invite_codes`) implement the invite-link → pending → approval flow the org plugin doesn't provide. All group operations live in a testable domain module (`src/lib/groups.ts`) behind server-action wrappers; every read/write goes through DAL guards (`requireUser`/`requireMember`/`requireAdmin`).

**Tech Stack:** better-auth (+ organization & magic-link plugins, Drizzle adapter), Resend SDK (email, test-mode only for now), Drizzle migrations, Neon (prod), existing Hearth/shadcn UI system.

**Decisions binding this plan:**
- **Production sign-in is Google-only for now.** Magic links fully work locally (console/file transport) and in Resend test mode (delivers only to the account owner). Resend domain verification is a deferred follow-up — do NOT block any task on it.
- Meetings tab ships as the Hearth empty state (screen 3e) only — no meeting creation (plan 3).
- Recipes and My prayers tabs render as Hearth-styled "coming soon" screens so the tab bar ships in its final shape.

## Global Constraints

- Next.js 16 App Router + TypeScript + Turbopack; mutations are server actions (no separate API layer beyond Better Auth's own handler).
- All DB access through `src/db/client.ts`; schema single entrypoint `src/db/schema.ts` (re-exports allowed); migrations via `mise run db:generate` / `db:migrate`.
- **Authorization rule (spec):** every query and mutation is scoped by group membership, enforced server-side in the DAL — never trusted from the client.
- Roles exactly `admin` and `member`. A group must always have ≥ 1 admin: the last admin can't be demoted, removed, or leave without promoting someone first.
- Display name required on first sign-in (prefilled from Google when available).
- Rotating an invite link only invalidates the old URL for new joiners; existing members and pending requests are unaffected. Pending status is per group.
- Hearth theme fidelity: screens 3a (sign in), 3b (waiting), 3c (create group), 3e (empty home), 3m (group admin) per `docs/design/hearth/README.md`; tokens/utilities only — never hardcode a color that has a token (`bg-primary`, `text-accent-strong`, `rounded-card`, `shadow-card`, `min-h-tap`, uppercase `tracking-label` section labels, serif headings).
- Copy style: sentence case, no exclamation marks, verb-first buttons.
- Tests green at every commit: `mise run lint && mise run typecheck && mise run test`; e2e where the task says so. Trunk-based: each task lands as a PR to `main` (checks + e2e required).
- Secrets: `.env` locally (gitignored), Vercel env for deploys, entered by the owner — never committed, never pasted into chat.
- If a Better Auth/library API differs from this plan's snippets (docs move fast), the library's current docs win — note every deviation in the task report. Docs: https://www.better-auth.com/docs
- Machine notes for implementers: `gh`/`git push`/`git config` and network installs need the Bash sandbox override after observing a failure (gh/push: always). Use `mise x -- pnpm …` if plain pnpm resolves to Homebrew's copy. Postgres must be up (`mise run db:up`) for integration tests.

---

### Task 1: Better Auth core — install, schema, first migration, handler

**Files:**
- Create: `src/lib/auth.ts`, `src/app/api/auth/[...all]/route.ts`, `src/db/auth-schema.ts` (generated), `tests/integration/auth-tables.test.ts`, `tests/integration/global-setup.ts`, `drizzle/` (generated migration)
- Modify: `src/db/schema.ts`, `src/db/client.ts`, `.env`, `.env.example`, `vitest.config.ts`, `package.json`

**Interfaces:**
- Consumes: `db` from `src/db/client.ts` (drizzle over pg Pool).
- Produces: `auth` (Better Auth instance) from `@/lib/auth`; all Better Auth tables (`user`, `session`, `account`, `verification`) migrated; `src/db/schema.ts` re-exporting `./auth-schema`; vitest `globalSetup` that migrates the test DB; SSL-ready `db` client. Later tasks add plugins to `src/lib/auth.ts` — keep its config object formatted one-plugin-per-line.

- [ ] **Step 1: Install and configure env**

```bash
mise x -- pnpm add better-auth
npx @better-auth/cli@latest secret   # prints a BETTER_AUTH_SECRET
```

Append to `.env` (real secret) and `.env.example` (placeholder text `generate-with-npx-better-auth-cli-secret`):

```
BETTER_AUTH_SECRET=<generated>
BETTER_AUTH_URL=http://localhost:3000
```

- [ ] **Step 2: Minimal auth instance**

`src/lib/auth.ts`:

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db/client";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
});
```

`src/app/api/auth/[...all]/route.ts`:

```ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { POST, GET } = toNextJsHandler(auth);
```

- [ ] **Step 3: Generate the Drizzle schema and wire the convention**

```bash
mise x -- pnpm dlx @better-auth/cli@latest generate --output src/db/auth-schema.ts
```

Replace `src/db/schema.ts` (currently `export {}`):

```ts
// Single schema entrypoint (CLAUDE.md convention). Better Auth tables are
// generated into auth-schema.ts by `@better-auth/cli generate` — regenerate
// there, never hand-edit. App tables are defined below in this file.
export * from "./auth-schema";
```

If the CLI's flags differ, consult `npx @better-auth/cli generate --help`; the non-negotiable outcome is: generated tables in `src/db/auth-schema.ts`, re-exported from `src/db/schema.ts`.

- [ ] **Step 4: SSL-ready db client (Neon watchout)**

Replace `src/db/client.ts`:

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const url = process.env.DATABASE_URL!;
const isLocal = /localhost|127\.0\.0\.1/.test(url);

// Neon (prod) requires TLS; local Docker Postgres doesn't speak it.
const pool = new Pool({ connectionString: url, ssl: isLocal ? undefined : true });

export const db = drizzle(pool);
```

- [ ] **Step 5: Generate and run the first migration**

```bash
mise run db:up
mise run db:generate   # creates drizzle/0000_*.sql from schema.ts
mise run db:migrate
```

Expected: migration applies cleanly; `drizzle/` contains one SQL file creating `user`, `session`, `account`, `verification`.

- [ ] **Step 6: Vitest migrates the DB before integration tests**

`tests/integration/global-setup.ts`:

```ts
import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export default async function setup() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
}
```

In `vitest.config.ts` add to the `test` block:

```ts
    globalSetup: ["tests/integration/global-setup.ts"],
```

- [ ] **Step 7: Write the failing integration test**

`tests/integration/auth-tables.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

describe("better auth schema", () => {
  it("migrated the core auth tables", async () => {
    const result = await db.execute(sql`
      select table_name from information_schema.tables
      where table_schema = 'public'
        and table_name in ('user', 'session', 'account', 'verification')
      order by table_name
    `);
    expect(result.rows.map((r) => r.table_name)).toEqual([
      "account",
      "session",
      "user",
      "verification",
    ]);
  });
});
```

- [ ] **Step 8: Run tests**

Run: `mise run test`
Expected: PASS (existing 3 + this one). Then `mise run lint && mise run typecheck && mise run build` all pass.

- [ ] **Step 9: Branch, commit, PR**

```bash
git checkout -b feat/auth-core
git add -A && git commit -m "Add Better Auth core with Drizzle schema and first migration"
git push -u origin feat/auth-core
gh pr create --title "Add Better Auth core" --fill
```

Wait for `checks` + `e2e` green, `gh pr merge --squash --delete-branch`, `git checkout main && git pull`.

---

### Task 2: Magic link + email transport + sign-in screen (3a) + display-name gate

**Files:**
- Create: `src/lib/auth-email.ts`, `src/lib/auth-client.ts`, `src/app/(auth)/sign-in/page.tsx`, `src/app/(auth)/sign-in/sign-in-form.tsx`, `src/app/(auth)/welcome/page.tsx`, `src/app/(auth)/welcome/welcome-form.tsx`, `src/lib/auth-email.test.ts`
- Modify: `src/lib/auth.ts`, `.env.example`, `package.json`

**Interfaces:**
- Consumes: `auth` from Task 1.
- Produces: `authClient` from `@/lib/auth-client` (React client with magic link); `sendAuthEmail({ to, url })` from `@/lib/auth-email` with transport modes `resend | file | console` selected by `pickTransport(env)`; routes `/sign-in` and `/welcome`. Later tasks rely on: signed-out users are sent to `/sign-in?next=<path>`; users without a display name are sent to `/welcome?next=<path>`.

- [ ] **Step 1: Write the failing transport-selection test**

`src/lib/auth-email.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pickTransport } from "./auth-email";

describe("pickTransport", () => {
  it("uses file transport when AUTH_EMAIL_FILE is set (e2e)", () => {
    expect(pickTransport({ AUTH_EMAIL_FILE: "/tmp/mail.jsonl", RESEND_API_KEY: "x" })).toBe("file");
  });
  it("uses resend when only RESEND_API_KEY is set", () => {
    expect(pickTransport({ RESEND_API_KEY: "re_123" })).toBe("resend");
  });
  it("falls back to console for local dev", () => {
    expect(pickTransport({})).toBe("console");
  });
});
```

Run: `mise run test` → FAIL (module not found).

- [ ] **Step 2: Implement the transport**

```bash
mise x -- pnpm add resend
```

`src/lib/auth-email.ts`:

```ts
import { appendFileSync } from "node:fs";
import { Resend } from "resend";

type Env = Partial<Record<"AUTH_EMAIL_FILE" | "RESEND_API_KEY", string>>;

export function pickTransport(env: Env): "file" | "resend" | "console" {
  if (env.AUTH_EMAIL_FILE) return "file";
  if (env.RESEND_API_KEY) return "resend";
  return "console";
}

export async function sendAuthEmail({ to, url }: { to: string; url: string }) {
  const mode = pickTransport(process.env);
  if (mode === "file") {
    appendFileSync(process.env.AUTH_EMAIL_FILE!, JSON.stringify({ to, url }) + "\n");
    return;
  }
  if (mode === "resend") {
    // Test mode until a sending domain is verified: delivers only to the
    // Resend account owner's inbox. Production sign-in is Google-only for now.
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "Small Group <onboarding@resend.dev>",
      to,
      subject: "Your sign-in link",
      text: `Sign in to Small Group: ${url}\n\nThis link expires in 5 minutes. If you didn't request it, ignore this email.`,
    });
    return;
  }
  console.log(`\n[auth email] magic link for ${to}:\n${url}\n`);
}
```

Run: `mise run test` → PASS. Add `RESEND_API_KEY=` and `AUTH_EMAIL_FILE=` lines (empty, commented) to `.env.example`.

- [ ] **Step 3: Enable the magic-link plugin**

In `src/lib/auth.ts` add:

```ts
import { magicLink } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { sendAuthEmail } from "@/lib/auth-email";
```

and inside `betterAuth({ ... })`:

```ts
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendAuthEmail({ to: email, url });
      },
    }),
    nextCookies(), // must stay last in this array (Better Auth docs)
  ],
```

- [ ] **Step 4: Auth client**

`src/lib/auth-client.ts`:

```ts
import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});
```

- [ ] **Step 5: Sign-in screen (Hearth 3a)**

`src/app/(auth)/sign-in/page.tsx` (server component):

```tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const { next } = await searchParams;
  if (session) redirect(next ?? "/");
  return (
    <main className="flex min-h-dvh flex-col justify-center gap-8 bg-background p-6">
      <div className="text-center">
        <h1 className="font-serif text-3xl font-semibold">Small Group</h1>
        <p className="text-muted-foreground mt-2">
          Meals, prayer, and notes for our weekly small group.
        </p>
      </div>
      <SignInForm next={next ?? "/"} />
    </main>
  );
}
```

`src/app/(auth)/sign-in/sign-in-form.tsx` (client component; per Hearth 3a: email field + terracotta "Send magic link" primary button + "No password needed…" hint + Google button; sentence case):

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignInForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: next,
      newUserCallbackURL: `/welcome?next=${encodeURIComponent(next)}`,
    });
    if (error) setError("Couldn't send the link. Check the address and try again.");
    else setSent(true);
  }

  if (sent)
    return (
      <div className="bg-card rounded-card shadow-card mx-auto w-full max-w-sm p-6 text-center">
        <h2 className="font-serif text-xl font-semibold">Check your email</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          We sent a sign-in link to {email}. It expires in 5 minutes.
        </p>
      </div>
    );

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <form onSubmit={sendLink} className="flex flex-col gap-3">
        <label className="text-strong text-sm font-medium" htmlFor="email">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="bg-card border-border focus:border-primary rounded-input min-h-tap w-full border-[1.5px] px-4 py-3.5 text-[16px] outline-none"
        />
        <Button type="submit" size="lg" className="min-h-tap w-full font-bold">
          Send magic link
        </Button>
        <p className="text-tertiary text-xs text-center">
          No password needed. We'll email you a secure link.
        </p>
        {error && <p className="text-destructive text-sm text-center">{error}</p>}
      </form>
      <div className="text-muted-foreground flex items-center gap-3 text-xs">
        <div className="bg-divider h-px flex-1" /> or <div className="bg-divider h-px flex-1" />
      </div>
      <Button
        variant="outline"
        size="lg"
        className="min-h-tap w-full"
        onClick={() => authClient.signIn.social({ provider: "google", callbackURL: next })}
      >
        Continue with Google
      </Button>
    </div>
  );
}
```

(The Google button 404s until Task 3 supplies credentials — expected; note it in the report.)

- [ ] **Step 6: Display-name gate (/welcome)**

`src/app/(auth)/welcome/page.tsx`:

```tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { WelcomeForm } from "./welcome-form";

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const { next } = await searchParams;
  if (!session) redirect("/sign-in");
  if (session.user.name?.trim()) redirect(next ?? "/");
  return (
    <main className="flex min-h-dvh flex-col justify-center gap-6 bg-background p-6">
      <div className="text-center">
        <h1 className="font-serif text-3xl font-semibold">Welcome</h1>
        <p className="text-muted-foreground mt-2">
          What should the group call you? Your name shows on meal claims and prayers.
        </p>
      </div>
      <WelcomeForm next={next ?? "/"} />
    </main>
  );
}
```

`src/app/(auth)/welcome/welcome-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function WelcomeForm({ next }: { next: string }) {
  const [name, setName] = useState("");
  const router = useRouter();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await authClient.updateUser({ name: trimmed });
    router.push(next);
  }

  return (
    <form onSubmit={save} className="mx-auto flex w-full max-w-sm flex-col gap-3">
      <label className="text-strong text-sm font-medium" htmlFor="name">
        Display name
      </label>
      <input
        id="name"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Sam Miller"
        className="bg-card border-border focus:border-primary rounded-input min-h-tap w-full border-[1.5px] px-4 py-3.5 text-[16px] outline-none"
      />
      <Button type="submit" size="lg" className="min-h-tap w-full font-bold">
        Continue
      </Button>
    </form>
  );
}
```

- [ ] **Step 7: Verify the loop locally (console transport)**

Run: `mise run dev`, open `/sign-in`, submit your email. Expected: magic link printed in the dev-server terminal; opening it signs you in and (as a new user) lands on `/welcome`; after entering a name you land on `/`. Then `mise run lint && mise run typecheck && mise run test` pass.

- [ ] **Step 8: Branch, commit, PR** (same flow as Task 1; message "Add magic-link sign-in with display-name gate")

---

### Task 3: Google sign-in (requires user's credentials)

**Files:**
- Modify: `src/lib/auth.ts`, `.env`, `.env.example`

**Interfaces:**
- Consumes: sign-in form's Google button (Task 2).
- Produces: working `socialProviders.google`; Google users arrive with `name` prefilled so they skip `/welcome`.

- [ ] **Step 1: USER ACTION — create the OAuth client (personal Google account)**

Walk the user through it; do not proceed until they confirm:
1. console.cloud.google.com (signed in as the personal account) → New project `small-group-app`.
2. APIs & Services → OAuth consent screen: External; app name "Small Group"; support email; scopes `email` + `profile`; publish (or add themselves as test user).
3. Credentials → Create credentials → OAuth client ID → Web application:
   - Authorized JavaScript origins: `http://localhost:3000`
   - Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`
   (Production origins/URIs get added in Task 8.)
4. User pastes `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` into `.env` themselves.

Add both names (empty values) to `.env.example`.

- [ ] **Step 2: Wire the provider**

In `src/lib/auth.ts` inside `betterAuth({ ... })`:

```ts
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
```

- [ ] **Step 3: Verify**

Run: `mise run dev` → `/sign-in` → Continue with Google. Expected: Google account chooser → back signed in; `/welcome` is skipped (name came from Google). `lint`/`typecheck`/`test` pass.

- [ ] **Step 4: Branch, commit, PR** ("Add Google sign-in")

---

### Task 4: Organization plugin + app tables (join_requests, invite_codes)

**Files:**
- Create: `tests/integration/group-tables.test.ts`, new `drizzle/` migration
- Modify: `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/db/auth-schema.ts` (regenerated), `src/db/schema.ts`

**Interfaces:**
- Consumes: Tasks 1–2 auth instance/client.
- Produces: org tables (`organization`, `member`, `invitation` + `session.activeOrganizationId`); app tables `join_requests` and `invite_codes` exported from `@/db/schema` as `joinRequests`, `inviteCodes`; roles configured so the **creator becomes `admin`** (spec has no `owner` role).

- [ ] **Step 1: Enable the plugin (server + client)**

`src/lib/auth.ts` — add to imports `organization` from `"better-auth/plugins"`, and as the FIRST entry of `plugins` (nextCookies stays last):

```ts
    organization({
      creatorRole: "admin",
      allowUserToCreateOrganization: true,
    }),
```

`src/lib/auth-client.ts` — add `organizationClient` from `"better-auth/client/plugins"` to the plugins array.

- [ ] **Step 2: Regenerate auth schema, add app tables**

```bash
mise x -- pnpm dlx @better-auth/cli@latest generate --output src/db/auth-schema.ts
```

Append to `src/db/schema.ts`:

```ts
import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "./auth-schema";

export const joinRequests = pgTable(
  "join_requests",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    groupId: text("group_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "approved", "denied"] }).notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    respondedAt: timestamp("responded_at"),
    respondedBy: text("responded_by").references(() => user.id),
  },
  (t) => [
    // one open request per user per group; denied users may request again
    uniqueIndex("join_requests_pending_unique")
      .on(t.groupId, t.userId)
      .where(sql`${t.status} = 'pending'`),
  ],
);

export const inviteCodes = pgTable("invite_codes", {
  groupId: text("group_id").primaryKey().references(() => organization.id, { onDelete: "cascade" }),
  code: text("code").notNull().unique(),
  rotatedAt: timestamp("rotated_at").notNull().defaultNow(),
});
```

(Add `import { sql } from "drizzle-orm";` at the top. If the generated file names its exports differently — e.g. `organizations` — match the generated names and note it.)

- [ ] **Step 3: Migrate and write the failing table test**

```bash
mise run db:generate && mise run db:migrate
```

`tests/integration/group-tables.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

describe("group schema", () => {
  it("migrated org + app tables", async () => {
    const result = await db.execute(sql`
      select table_name from information_schema.tables
      where table_schema = 'public'
        and table_name in ('organization', 'member', 'join_requests', 'invite_codes')
      order by table_name
    `);
    expect(result.rows.map((r) => r.table_name)).toEqual([
      "invite_codes",
      "join_requests",
      "member",
      "organization",
    ]);
  });

  it("enforces one pending request per user per group", async () => {
    await db.execute(sql`insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
      values ('u_t4', 'Test', 't4@example.com', true, now(), now()) on conflict do nothing`);
    await db.execute(sql`insert into organization (id, name, slug, "createdAt")
      values ('g_t4', 'G', 'g-t4', now()) on conflict do nothing`);
    await db.execute(sql`delete from join_requests where user_id = 'u_t4'`);
    await db.execute(sql`insert into join_requests (group_id, user_id) values ('g_t4', 'u_t4')`);
    await expect(
      db.execute(sql`insert into join_requests (group_id, user_id) values ('g_t4', 'u_t4')`),
    ).rejects.toThrow();
  });
});
```

Column casing note: Better Auth's generated columns are camelCase-quoted (`"emailVerified"`); if the generated SQL differs, mirror what's actually in `drizzle/` and note it.

Run: `mise run test` → both new tests PASS (first fails only if migration missing).

- [ ] **Step 4: Full checks, branch, commit, PR** ("Add organization plugin and group app tables")

---

### Task 5: DAL guards + groups domain module (TDD core of the plan)

**Files:**
- Create: `src/lib/dal.ts`, `src/lib/groups.ts`, `tests/integration/groups.test.ts`
- Test: `tests/integration/groups.test.ts`

**Interfaces:**
- Consumes: `db`, schema tables, `auth`.
- Produces (exact signatures later tasks call):
  - `dal.ts`: `getSession(): Promise<Session | null>` (wraps `auth.api.getSession({ headers: await headers() })`); `requireUser(): Promise<SessionUser>` (redirects `/sign-in` when absent, `/welcome` when unnamed); `requireMember(groupId: string): Promise<{ user: SessionUser; role: "admin" | "member" }>` and `requireAdmin(groupId: string)` — both throw `new Error("forbidden")` on failure.
  - `groups.ts` (pure domain, explicit actor params, no headers/session — the testable seam):
    `createGroup(actorId: string, name: string): Promise<{ groupId: string }>`;
    `getMembership(groupId: string, userId: string): Promise<{ role: "admin" | "member" } | null>`;
    `listMembers(groupId: string)`; `listPendingRequests(groupId: string)`;
    `adminCount(groupId: string): Promise<number>`;
    `requestToJoin(actorId: string, code: string): Promise<{ groupId: string; groupName: string }>`;
    `approveRequest(actorId: string, requestId: string): Promise<void>`;
    `denyRequest(actorId: string, requestId: string): Promise<void>`;
    `promoteMember(actorId: string, groupId: string, memberUserId: string)`;
    `demoteMember(actorId: string, groupId: string, memberUserId: string)`;
    `removeMember(actorId: string, groupId: string, memberUserId: string)`;
    `leaveGroup(actorId: string, groupId: string)`;
    `renameGroup(actorId: string, groupId: string, name: string)`;
    `rotateInviteCode(actorId: string, groupId: string): Promise<{ code: string }>`;
    `getInviteCode(groupId: string): Promise<string>`; `newInviteCode(): string`.
  - Error contract: all domain functions throw `Error` with messages exactly `"forbidden"`, `"not-found"`, `"last-admin"`, `"already-member"` — server actions map them to friendly copy.

**Implementation notes (binding):**
- `createGroup` inserts the organization + admin member directly via Drizzle in one transaction (id via `crypto.randomUUID()`, slug from slugified name + 6-char suffix) AND creates its invite code row. Direct inserts (not `auth.api.createOrganization`) keep the domain module header-free and testable; note this deviation-by-design in reports.
- `newInviteCode`: 10 chars from `crypto.randomUUID().replace(/-/g, "").slice(0, 10)`.
- `approveRequest`: transaction — flip status to `approved` + insert `member` row (role `member`); actor must be admin of that group; request must be `pending` else `"not-found"`.
- `requestToJoin`: resolve code → if already a member, throw `"already-member"`; if a pending request exists, return it idempotently.
- Demote/remove/leave on an admin when `adminCount === 1` throws `"last-admin"`.

- [ ] **Step 1: Write the failing integration tests (the invariants ARE the spec)**

`tests/integration/groups.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  adminCount, approveRequest, createGroup, demoteMember, getInviteCode,
  getMembership, leaveGroup, promoteMember, removeMember, requestToJoin,
  rotateInviteCode,
} from "@/lib/groups";

async function mkUser(id: string) {
  await db.execute(sql`insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values (${id}, ${id}, ${id + "@example.com"}, true, now(), now()) on conflict do nothing`);
  return id;
}

describe("groups domain", () => {
  let alice: string, bob: string, cara: string;
  beforeAll(async () => {
    [alice, bob, cara] = await Promise.all([mkUser("u_alice"), mkUser("u_bob"), mkUser("u_cara")]);
  });

  it("creator becomes admin and gets an invite code", async () => {
    const { groupId } = await createGroup(alice, "Tuesday group");
    expect((await getMembership(groupId, alice))?.role).toBe("admin");
    expect(await getInviteCode(groupId)).toHaveLength(10);
  });

  it("join flow: request → approve → member", async () => {
    const { groupId } = await createGroup(alice, "Joinable");
    const code = await getInviteCode(groupId);
    const req = await requestToJoin(bob, code);
    expect(req.groupId).toBe(groupId);
    expect(await getMembership(groupId, bob)).toBeNull();
    const [pending] = (await db.execute(
      sql`select id from join_requests where group_id = ${groupId} and user_id = ${bob} and status = 'pending'`,
    )).rows as { id: string }[];
    await approveRequest(alice, pending.id);
    expect((await getMembership(groupId, bob))?.role).toBe("member");
  });

  it("non-admin cannot approve", async () => {
    const { groupId } = await createGroup(alice, "Sealed");
    const code = await getInviteCode(groupId);
    await requestToJoin(bob, code);
    const [pending] = (await db.execute(
      sql`select id from join_requests where group_id = ${groupId} and user_id = ${bob}`,
    )).rows as { id: string }[];
    await expect(approveRequest(cara, pending.id)).rejects.toThrow("forbidden");
  });

  it("rotating the code invalidates the old one for new joiners only", async () => {
    const { groupId } = await createGroup(alice, "Rotating");
    const oldCode = await getInviteCode(groupId);
    await rotateInviteCode(alice, groupId);
    await expect(requestToJoin(bob, oldCode)).rejects.toThrow("not-found");
    await expect(requestToJoin(bob, await getInviteCode(groupId))).resolves.toBeTruthy();
  });

  it("last admin cannot demote, leave, or be removed", async () => {
    const { groupId } = await createGroup(alice, "Fragile");
    await expect(demoteMember(alice, groupId, alice)).rejects.toThrow("last-admin");
    await expect(leaveGroup(alice, groupId)).rejects.toThrow("last-admin");
    await expect(removeMember(alice, groupId, alice)).rejects.toThrow("last-admin");
    const code = await getInviteCode(groupId);
    await requestToJoin(bob, code);
    const [p] = (await db.execute(
      sql`select id from join_requests where group_id = ${groupId} and user_id = ${bob}`,
    )).rows as { id: string }[];
    await approveRequest(alice, p.id);
    await promoteMember(alice, groupId, bob);
    expect(await adminCount(groupId)).toBe(2);
    await expect(leaveGroup(alice, groupId)).resolves.toBeUndefined();
  });
});
```

Run: `mise run test` → FAIL (module not found).

- [ ] **Step 2: Implement `src/lib/groups.ts`**

Write the module implementing every exported function per the Implementation notes. Skeleton with the two subtlest functions in full — implement the rest to the same pattern:

```ts
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { inviteCodes, joinRequests } from "@/db/schema";
import { member, organization } from "@/db/auth-schema";

export function newInviteCode(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

export async function createGroup(actorId: string, name: string) {
  const groupId = crypto.randomUUID();
  const slug =
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) +
    "-" + newInviteCode().slice(0, 6);
  await db.transaction(async (tx) => {
    await tx.insert(organization).values({ id: groupId, name, slug, createdAt: new Date() });
    await tx.insert(member).values({
      id: crypto.randomUUID(), organizationId: groupId, userId: actorId,
      role: "admin", createdAt: new Date(),
    });
    await tx.insert(inviteCodes).values({ groupId, code: newInviteCode() });
  });
  return { groupId };
}

export async function approveRequest(actorId: string, requestId: string) {
  const [req] = await db.select().from(joinRequests).where(eq(joinRequests.id, requestId));
  if (!req || req.status !== "pending") throw new Error("not-found");
  const actor = await getMembership(req.groupId, actorId);
  if (actor?.role !== "admin") throw new Error("forbidden");
  await db.transaction(async (tx) => {
    await tx.update(joinRequests)
      .set({ status: "approved", respondedAt: new Date(), respondedBy: actorId })
      .where(and(eq(joinRequests.id, requestId), eq(joinRequests.status, "pending")));
    await tx.insert(member).values({
      id: crypto.randomUUID(), organizationId: req.groupId, userId: req.userId,
      role: "member", createdAt: new Date(),
    });
  });
}
```

(If the generated `member`/`organization` table exports or column names differ, match them exactly.) `adminCount` = `select count(*) from member where organizationId = X and role = 'admin'`. Guards: every mutating function loads the actor's membership first and throws `"forbidden"` unless the rule says otherwise (leave = any member; others = admin).

- [ ] **Step 3: Run tests until green**

Run: `mise run test` → all PASS, including prior suites.

- [ ] **Step 4: Implement `src/lib/dal.ts`**

```ts
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMembership } from "@/lib/groups";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (!session.user.name?.trim()) redirect("/welcome");
  return session.user;
}

export async function requireMember(groupId: string) {
  const user = await requireUser();
  const membership = await getMembership(groupId, user.id);
  if (!membership) throw new Error("forbidden");
  return { user, role: membership.role };
}

export async function requireAdmin(groupId: string) {
  const result = await requireMember(groupId);
  if (result.role !== "admin") throw new Error("forbidden");
  return result;
}
```

- [ ] **Step 5: Full checks, branch, commit, PR** ("Add group domain module and DAL guards")

---

### Task 6: Authed shell — tab bar, no-group landing, create group (3c), switcher

**Files:**
- Create: `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`, `src/components/tab-bar.tsx`, `src/components/group-switcher.tsx`, `src/components/no-group-home.tsx`, `src/app/(app)/create-group/page.tsx`, `src/app/(app)/create-group/actions.ts`, `src/app/(app)/recipes/page.tsx`, `src/app/(app)/prayers/page.tsx`
- Modify: `src/app/page.tsx` (moves into the group), `e2e/home.spec.ts`

**Interfaces:**
- Consumes: `requireUser` (DAL), `createGroup` (domain), `authClient.organization.setActive` / `useListOrganizations` (org client).
- Produces: route structure later tasks slot into — `/(app)/page.tsx` home, `/group` tab (Task 7 fills it), tab bar with tabs Meetings `/`, Recipes `/recipes`, My prayers `/prayers`, Group `/group`; `activeGroupId` resolution: `session.session.activeOrganizationId`, else the user's first membership (set active via server call), else no-group landing.

**Steps (abbreviated UI task — full checks still apply):**

- [ ] **Step 1:** `(app)/layout.tsx`: `await requireUser()`; render children above `<TabBar />` (fixed bottom, `bg-surface-tab`, top border `border-divider-tab`, 4 equal columns, 22px stroke icons via lucide-react at `strokeWidth={1.8}`, labels `text-tab`; active tab `text-accent-strong font-bold`, inactive `text-[#A99878]` — this exact hex is IN the Hearth component recipes, allowed). Move the old marketing `src/app/page.tsx` into `(app)/page.tsx` replaced by real home; root `/` now requires auth (signed-out users bounce to `/sign-in` via `requireUser`).
- [ ] **Step 2:** Home logic in `(app)/page.tsx`: no memberships → `<NoGroupHome />` (Hearth: serif "Small Group" welcome, terracotta "Create a group" button linking `/create-group`, hint copy "Joining an existing group? Ask its admin for the invite link."). With memberships: resolve active group (fall back to first + `auth.api.setActiveOrganization({ body: { organizationId }, headers })`), render group name header + `<GroupSwitcher />` + meetings empty state placeholder (Task 7 replaces with 3e).
- [ ] **Step 3:** `/create-group` (3c): name input + "Create group" action → server action `createGroupAction(formData)`: `const user = await requireUser(); const { groupId } = await createGroup(user.id, name); await auth.api.setActiveOrganization({ body: { organizationId: groupId }, headers: await headers() }); redirect("/")`.
- [ ] **Step 4:** `GroupSwitcher` (client): `authClient.useListOrganizations()`; if >1 org render a select styled `bg-surface-tint rounded-chip text-sm`; on change `await authClient.organization.setActive({ organizationId }); router.refresh()`.
- [ ] **Step 5:** Recipes/Prayers tabs: Hearth-styled empty screens — serif `text-xl` title + `text-muted-foreground` line "Coming soon — part of a later release."
- [ ] **Step 6:** Update `e2e/home.spec.ts`: `/` now redirects signed-out users; the smoke test asserts the SIGN-IN screen instead:

```ts
import { expect, test } from "@playwright/test";

test("signed-out home redirects to sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("heading", { name: "Small Group" })).toBeVisible();
});
```

- [ ] **Step 7:** Verify: `mise run build && mise run e2e` green; manual dev-server pass: sign in (console link) → no-group home → create group → land on home with group name + tab bar. `lint`/`typecheck`/`test` green.
- [ ] **Step 8:** Branch, commit, PR ("Add authed shell, no-group landing, and create group flow").

---

### Task 7: Join flow — /join/[code], waiting screen (3b), home empty state (3e)

**Files:**
- Create: `src/app/(app)/join/[code]/page.tsx`, `src/app/(app)/join/actions.ts`, `src/components/waiting-for-approval.tsx`, `src/components/meetings-empty.tsx`
- Modify: `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `requestToJoin`, DAL, domain errors (`already-member`, `not-found`).
- Produces: shareable invite URL format `${BETTER_AUTH_URL}/join/<code>`; pending requests visible on the requester's home; Task 8's admin screen consumes the same `join_requests` rows.

**Steps:**

- [ ] **Step 1:** `/join/[code]/page.tsx` (inside `(app)` so `requireUser` runs — signed-out users bounce to `/sign-in?next=/join/<code>`; make `(app)/layout.tsx` pass `next` by using the current path: `redirect(\`/sign-in?next=${encodeURIComponent(pathname)}\`)` — implement via a tiny helper in dal.ts: `requireUser(nextPath?: string)`). Server component: call `requestToJoinAction(code)` on load? No — render a confirm card first (group name + "Ask to join" button → server action). Handle errors: `not-found` → "This invite link is no longer valid. Ask the group admin for a fresh one."; `already-member` → redirect `/`.
- [ ] **Step 2:** After requesting: `<WaitingForApproval groupName={...} />` (Hearth 3b: card, serif title "Request sent", copy "An admin will let you in — check back soon.", subtle `bg-success-tint text-success` pill "Waiting for approval"). Requester's home also lists their pending groups with the same pill (query join_requests by userId+pending).
- [ ] **Step 3:** `<MeetingsEmpty />` (Hearth 3e) replacing Task 6's placeholder on home when the active group has no meetings — serif title "No meetings yet", body "When your group plans a week, it'll show up here." NO create button (plan 3 adds it).
- [ ] **Step 4:** Verify manually with two browsers (console transport): user B requests, sees waiting screen; approval path stays pending (Task 8 completes it). `lint`/`typecheck`/`test`/`build`/`e2e` green.
- [ ] **Step 5:** Branch, commit, PR ("Add invite-link join flow with waiting state").

---

### Task 8: Group tab (3m) — members, approvals, admin actions

**Files:**
- Create: `src/app/(app)/group/page.tsx`, `src/app/(app)/group/actions.ts`, `src/components/member-row.tsx`, `src/components/invite-link-card.tsx`, `src/components/pending-request-row.tsx`
- Modify: none

**Interfaces:**
- Consumes: entire domain module + DAL; `useListOrganizations` refresh after rename.
- Produces: complete admin surface; server actions `approveRequestAction`, `denyRequestAction`, `promoteMemberAction`, `demoteMemberAction`, `removeMemberAction`, `leaveGroupAction`, `renameGroupAction`, `rotateInviteAction` — each: `requireUser()` → domain call in try/catch → map `last-admin` to "Promote another admin first — a group always needs one." and `forbidden` to "Only admins can do that." → `revalidatePath("/group")`.

**Steps:**

- [ ] **Step 1:** Page layout per 3m: group name header (admin sees inline rename); MEMBERS section label (`text-xs tracking-label uppercase text-muted-foreground`) — rows with `bg-avatar text-avatar-foreground` initials circle, name, `bg-accent-tint text-accent-strong text-xs rounded-full px-2` ADMIN pill; admin-only ⋯ menu (shadcn dropdown) with Make admin / Remove admin / Remove from group (destructive `text-destructive`).
- [ ] **Step 2:** Pending requests (admin only): `bg-warning-surface border-warning-border rounded-chip` callout per request — "<name> wants to join" + Approve (`bg-success` white text pill) / Deny (ghost).
- [ ] **Step 3:** Invite link card: full URL `${process.env.BETTER_AUTH_URL}/join/${code}`, Copy button (`navigator.clipboard`, flips to "Copied" 2s), admin-only Rotate with confirm dialog ("New link invalidates the old one for new joiners. Members and pending requests keep their access.").
- [ ] **Step 4:** Leave group (every member, bottom, destructive text button + confirm). Last-admin attempts surface the mapped error inline.
- [ ] **Step 5:** Verify with two browsers end-to-end: B requests → A approves → B's home shows the group; A promotes B; A leaves; B is sole admin. `lint`/`typecheck`/`test`/`build` green.
- [ ] **Step 6:** Branch, commit, PR ("Add group admin screen with approvals and member management").

---

### Task 9: Service-worker auth exclusion + full-loop e2e

**Files:**
- Create: `e2e/auth-groups.spec.ts`
- Modify: `src/app/sw.ts`, `playwright.config.ts`, `.gitignore`

**Interfaces:**
- Consumes: everything shipped in Tasks 1–8; file email transport (`AUTH_EMAIL_FILE`).
- Produces: `/api/auth/*` never handled by the service worker cache; a repeatable two-user e2e proving the whole membership lifecycle.

- [ ] **Step 1: SW exclusion (final-review watchout)**

In `src/app/sw.ts`, change the Serwist config's `runtimeCaching` to put a network-only rule for auth AHEAD of the defaults:

```ts
import { NetworkOnly } from "serwist";
```

```ts
  runtimeCaching: [
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/auth/"),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
```

- [ ] **Step 2: Playwright wiring for file-mode email**

`playwright.config.ts` — extend `webServer` with an env block (keep existing fields):

```ts
  webServer: {
    command: "pnpm next start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    env: { AUTH_EMAIL_FILE: ".e2e-mail.jsonl" },
  },
```

Add `.e2e-mail.jsonl` to `.gitignore`.

- [ ] **Step 3: The full-loop spec**

`e2e/auth-groups.spec.ts`:

```ts
import { readFileSync, rmSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const MAIL = ".e2e-mail.jsonl";

async function signIn(page: Page, email: string, name: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send magic link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  const lines = readFileSync(MAIL, "utf8").trim().split("\n");
  const { url } = JSON.parse(lines[lines.length - 1]);
  await page.goto(url);
  if (page.url().includes("/welcome")) {
    await page.getByLabel("Display name").fill(name);
    await page.getByRole("button", { name: "Continue" }).click();
  }
}

test("two users: create group, invite, approve, member arrives", async ({ browser }) => {
  rmSync(MAIL, { force: true });
  const run = Date.now();

  const alice = await (await browser.newContext()).newPage();
  await signIn(alice, `alice-${run}@example.com`, "Alice");
  await alice.getByRole("link", { name: "Create a group" }).click();
  await alice.getByLabel("Group name").fill(`Tuesday ${run}`);
  await alice.getByRole("button", { name: "Create group" }).click();
  await expect(alice.getByText(`Tuesday ${run}`)).toBeVisible();

  await alice.getByRole("link", { name: "Group" }).click();
  const inviteUrl = await alice.getByTestId("invite-url").innerText();

  const bob = await (await browser.newContext()).newPage();
  await signIn(bob, `bob-${run}@example.com`, "Bob");
  await bob.goto(new URL(inviteUrl).pathname);
  await bob.getByRole("button", { name: "Ask to join" }).click();
  await expect(bob.getByText("Waiting for approval")).toBeVisible();

  await alice.reload();
  await alice.getByRole("button", { name: "Approve" }).click();
  await expect(alice.getByText("Bob")).toBeVisible();

  await bob.goto("/");
  await expect(bob.getByText(`Tuesday ${run}`)).toBeVisible();
});
```

(Requires `data-testid="invite-url"` on the invite URL element from Task 8 — add it there if missed.)

- [ ] **Step 4: Run everything**

Run: `mise run db:up && mise run build && mise run e2e`
Expected: both e2e specs pass. Full local suite green.

- [ ] **Step 5: Branch, commit, PR** ("Exclude auth routes from SW caching; add membership e2e")

---

### Task 10: Production — Neon, env, migrate-on-build, Google prod, live verify

**Files:**
- Create: `vercel.json`
- Modify: `README.md`, `CLAUDE.md`, `docs/superpowers/specs/2026-07-02-small-group-pwa-design.md` (status note)

**Interfaces:**
- Consumes: everything; user's Vercel + Google dashboards.
- Produces: production auth against Neon; Google-only prod sign-in live.

- [ ] **Step 1: USER ACTION — provision Neon + env vars**

1. Vercel dashboard → project → Storage (or Marketplace) → add **Neon Postgres** (free tier, closest region) → connect to the project. This injects `DATABASE_URL` into the project env.
2. Vercel → Settings → Environment Variables, user adds: `BETTER_AUTH_SECRET` (fresh one: `npx @better-auth/cli secret` — different from local), `BETTER_AUTH_URL=https://small-group-app-beta.vercel.app`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. (No `RESEND_API_KEY` — production is Google-only until the domain follow-up.)
3. Google console → the OAuth client → add origin `https://small-group-app-beta.vercel.app` and redirect URI `https://small-group-app-beta.vercel.app/api/auth/callback/google`.

- [ ] **Step 2: Migrate on build**

`vercel.json`:

```json
{
  "buildCommand": "pnpm drizzle-kit migrate && pnpm next build"
}
```

Known limitation to note in the PR body: preview deployments run migrations against the same Neon database (no per-preview branching yet — spec lists it as a later addition).

- [ ] **Step 3: Docs**

README: under Development add `mise run db:generate` note + an "Auth" paragraph (Google in prod; magic links local/test-mode pending domain). CLAUDE.md conventions add: "Auth: Better Auth (`src/lib/auth.ts`); group operations live in `src/lib/groups.ts` behind DAL guards (`src/lib/dal.ts`) — server actions stay thin." Spec: change status line to "Plans 1–2 implemented; production sign-in Google-only pending Resend domain."

- [ ] **Step 4: Ship and verify live**

Branch/commit/PR ("Add production auth: Neon migrate-on-build and prod config"); merge when green. Then verify on https://small-group-app-beta.vercel.app: sign in with Google → /welcome skipped → create a real group → invite link renders → sign out/in persists session. Confirm Neon dashboard shows the tables. Expected: full loop works; magic-link path intentionally untested in prod.

---

## Plan Self-Review (completed)

- **Spec coverage:** sign-in methods, display names, open sign-up, no-group landing, multi-group + switcher, invite rotation semantics, per-group pending, last-admin invariant, admin capabilities, authorization rule, Neon — each maps to a task. Deferred by decision: Resend domain (follow-up), meetings creation (plan 3).
- **Placeholder scan:** Task 5 Step 2 intentionally shows two functions in full and binds the rest by signature + notes (the test file in Step 1 defines their exact behavior); Tasks 6–8 are UI tasks with binding design/interface specs rather than full page code — acceptable altitude, no TBDs.
- **Type consistency:** domain signatures in Task 5 match call sites in Tasks 6–8 (`createGroup(user.id, name)`, `requestToJoin(actorId, code)`, error strings `forbidden|not-found|last-admin|already-member`); `AUTH_EMAIL_FILE` name consistent across Tasks 2 and 9; `data-testid="invite-url"` produced in Task 8, consumed in Task 9.
