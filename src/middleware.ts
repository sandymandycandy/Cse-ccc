import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Must match the sessionToken cookie name configured in src/lib/auth/index.ts.
const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-ccc.session" : "ccc.session";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Expose the path to the root layout so it can drop the public site chrome on
  // admin routes (Server Components can't otherwise read the current pathname).
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  const proceed = NextResponse.next({ request: { headers } });

  // Layer 1 (SECURITY_SPEC §4): a UX redirect only. The login page is open;
  // every other /admin route needs a session cookie. The authoritative check is
  // the per-page server guard, which re-validates the session against the DB.
  if (pathname === "/admin/login") return proceed;
  if (!req.cookies.has(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return proceed;
}

export const config = {
  matcher: ["/admin/:path*"],
};
