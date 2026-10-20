import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getMembership } from "@/lib/membership";
import { safeNextPath } from "@/lib/utils";

// Where a tapped notification lands: /open?group=<id>&next=<path>
// (src/lib/notifications.ts). Screens show the session's active group
// (src/lib/dal.ts), and a path like /group or /meetings/<id> doesn't say which
// group it's about, so a member who had Group B open and tapped a Group A
// notification used to land in Group B. This switches to the notification's
// group first, then redirects to the screen.
//
// A GET that changes state: the most another site could do by linking here is
// move a member to another group they already belong to. A group the member
// has since left is ignored and the screen opens as usual. The service worker
// sends this path straight to the network (src/app/sw.ts), so a cached
// redirect can't skip the switch.
//
// Reads the request's own headers rather than next/headers so the integration
// test can call it directly (tests/integration/open-in-group.test.ts).
export async function GET(request: NextRequest) {
  const { searchParams, pathname, search } = request.nextUrl;

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    // Sessions expire. Come back through here after signing in, so the group
    // still switches.
    const signIn = `/sign-in?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(new URL(signIn, request.url));
  }

  const groupId = searchParams.get("group");
  if (
    groupId &&
    groupId !== session.session.activeOrganizationId &&
    (await getMembership(groupId, session.user.id))
  ) {
    await auth.api.setActiveOrganization({
      body: { organizationId: groupId },
      headers: request.headers,
    });
  }

  return NextResponse.redirect(new URL(safeNextPath(searchParams.get("next")), request.url));
}
