import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { auth } from "@/lib/auth";
import { getMembership } from "@/lib/membership";

// One lookup per render. The (app) layout and the page each call
// requireUser(), and most pages call getSession() again for the active group:
// three sequential session reads from the database, on every page. React's
// cache() shares the first one across the render. Outside a render (server
// actions) it doesn't memoize, so an action that changes the session never
// reads a stale copy.
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

// Falls back to the pathname src/proxy.ts stamps on every request (except
// the bare `/`, whose sign-in redirect needs no `next` anyway). This
// matters because (app)/layout.tsx — which wraps every page, including
// /join/[code] — calls requireUser() with no argument; without this
// fallback its redirect would always win the race against a page's own
// requireUser(nextPath) call (a parent Server Component's redirect() fires
// before its child page component is ever invoked), dropping `next`
// entirely for signed-out users. Pages can still pass an explicit
// nextPath to be self-sufficient regardless of the proxy's matcher.
async function resolveNextPath(nextPath?: string) {
  if (nextPath) return nextPath;
  return (await headers()).get("x-pathname") ?? undefined;
}

export async function requireUser(nextPath?: string) {
  const session = await getSession();
  const path = await resolveNextPath(nextPath);
  if (!session) {
    redirect(path ? `/sign-in?next=${encodeURIComponent(path)}` : "/sign-in");
  }
  // Every server error and log from here to the end of this request carries
  // who it happened to, by id only (src/lib/sentry-config.ts). Set before the
  // /welcome redirect so a new member's first steps are covered too.
  Sentry.setUser({ id: session.user.id });
  if (!session.user.name?.trim()) {
    redirect(path ? `/welcome?next=${encodeURIComponent(path)}` : "/welcome");
  }
  return session.user;
}

// Resolves which group a page should render: the session's active organization
// if the user still belongs to it, otherwise their first membership — and
// persists that fallback so the session (and every group-scoped page) agree on
// the choice. `/` and `/group` each render independently and either is
// reachable directly, so both resolve through here rather than duplicating the
// rule and risking drift. Callers must pass a non-empty `organizations` (both
// handle the no-groups case before calling).
export async function resolveActiveGroup<T extends { id: string }>(
  activeOrganizationId: string | null | undefined,
  organizations: T[],
): Promise<T> {
  const active = organizations.find((org) => org.id === activeOrganizationId);
  if (active) return active;
  const fallback = organizations[0];
  await auth.api.setActiveOrganization({
    body: { organizationId: fallback.id },
    headers: await headers(),
  });
  return fallback;
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
