import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { makeIdleToken, readIdleToken, isIdleExpired } from "@/lib/auth/idle";

const useSecureCookies = process.env.NODE_ENV === "production";

// Must match the sessionToken cookie name configured in src/lib/auth/index.ts.
const SESSION_COOKIE = useSecureCookies ? "__Host-ccc.session" : "ccc.session";
// The activity clock for the idle timeout (§3), kept separate from the session.
const IDLE_COOKIE = useSecureCookies ? "__Host-ccc.idle" : "ccc.idle";

function toLogin(req: NextRequest, pathname: string): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

function clearCookie(res: NextResponse, name: string): void {
  res.cookies.set({
    name,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: useSecureCookies,
    maxAge: 0,
  });
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Expose the path to the root layout so it can drop the public site chrome on
  // admin routes (Server Components can't otherwise read the current pathname).
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  const proceed = NextResponse.next({ request: { headers } });

  // Layer 1 (SECURITY_SPEC §4): a UX redirect only. Login and invite-acceptance
  // are open (the new admin has no session yet); every other /admin route needs a
  // session cookie. The authoritative check is the per-page server guard, which
  // re-validates the session against the DB.
  if (pathname === "/admin/login" || pathname === "/admin/accept-invite") return proceed;
  if (!req.cookies.has(SESSION_COOKIE)) return toLogin(req, pathname);

  // Idle timeout (SECURITY_SPEC §3): end the session after IDLE_MS of inactivity.
  // The clock lives in a signed, httpOnly cookie the proxy check-then-slides on
  // every admin request. On expiry we clear the session cookie too — the JWT is
  // stateless, so dropping the cookie is the logout; a redirect alone would let
  // the still-valid token walk straight back in. A missing/forged clock reads as
  // null (a fresh login), which starts the clock rather than bouncing the user.
  const secret = process.env.NEXTAUTH_SECRET;
  if (secret) {
    const now = Date.now();
    const lastSeen = readIdleToken(req.cookies.get(IDLE_COOKIE)?.value, secret);
    if (isIdleExpired(lastSeen, now)) {
      const res = toLogin(req, pathname);
      clearCookie(res, IDLE_COOKIE);
      clearCookie(res, SESSION_COOKIE);
      return res;
    }
    proceed.cookies.set({
      name: IDLE_COOKIE,
      value: makeIdleToken(now, secret),
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
      // Outlive the idle window so an idle admin still carries a (stale) clock to
      // be caught; the JWT's 8h absolute cap remains authoritative for max age.
      maxAge: 8 * 60 * 60,
    });
  }

  return proceed;
}

export const config = {
  matcher: ["/admin/:path*"],
};
