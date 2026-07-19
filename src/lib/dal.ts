import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMembership } from "@/lib/groups";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireUser(nextPath?: string) {
  const session = await getSession();
  if (!session) {
    redirect(nextPath ? `/sign-in?next=${encodeURIComponent(nextPath)}` : "/sign-in");
  }
  if (!session.user.name?.trim()) {
    redirect(nextPath ? `/welcome?next=${encodeURIComponent(nextPath)}` : "/welcome");
  }
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
