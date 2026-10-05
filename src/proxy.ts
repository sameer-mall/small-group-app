import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Stamps the current pathname onto a request header so Server Components
// that don't otherwise know the current URL (notably (app)/layout.tsx,
// which renders above every page and can't read route params) can still
// build a correct `?next=` redirect target. See src/lib/dal.ts#requireUser.
// Every path except the bare `/` (see the matcher below).
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // `monitoring` is Sentry's tunnel (next.config.ts). Sentry's docs ask that a
  // proxy stay out of it so browser reports pass straight through.
  //
  // `.+`, not `.*`: the bare `/` is left out. It's the installed app's
  // start_url, so every launch requests it, and on Vercel this proxy is a
  // separate function whose cold start (~0.45s) sits in front of the page.
  // Nothing is lost: without x-pathname, a signed-out `/` redirects to plain
  // `/sign-in`, and sign-in already falls back to `/`.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|monitoring).+)"],
};
