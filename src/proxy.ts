import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Stamps the current pathname onto a request header so Server Components
// that don't otherwise know the current URL (notably (app)/layout.tsx,
// which renders above every page and can't read route params) can still
// build a correct `?next=` redirect target. See src/lib/dal.ts#requireUser.
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
