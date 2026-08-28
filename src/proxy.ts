import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { makeIdleToken, readIdleToken, idleAction } from "@/lib/auth/idle";

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

export async function proxy(req: NextRequest) {
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

  const secret = process.env.NEXTAUTH_SECRET;
  if (secret) {
    // Decode the session once; every check below fails open on a decode error so
    // a JWT misconfig can never brick the admin panel.
    let token: Awaited<ReturnType<typeof getToken>> = null;
    try {
      token = await getToken({ req, secret, salt: SESSION_COOKIE, cookieName: SESSION_COOKIE });
    } catch {
      token = null;
    }

    // Idle timeout (SECURITY_SPEC §3): end the session after IDLE_MS of inactivity.
    // The clock lives in a signed, httpOnly cookie the proxy check-then-slides on
    // every admin request. On expiry we clear the session cookie too — the JWT is
    // stateless, so dropping the cookie is the logout; a redirect alone would let
    // the still-valid token walk straight back in. A missing/forged clock can't be
    // trusted (anyone with the session cookie could strip it to defeat the
    // timeout), so we fall back to the session's own issued-at: a fresh login may
    // start a clock, but an aged session with no clock is treated as expired.
    const now = Date.now();
    const lastSeen = readIdleToken(req.cookies.get(IDLE_COOKIE)?.value, secret);
    const sessionIatMs = lastSeen === null && token?.iat ? token.iat * 1000 : null;
    if (idleAction(lastSeen, sessionIatMs, now) === "expire") {
      const res = toLogin(req, pathname);
      clearCookie(res, IDLE_COOKIE);
      clearCookie(res, SESSION_COOKIE);
      return res;
    }

    // Mandatory-TOTP (SECURITY_SPEC §3): a TOTP-required role that hasn't enrolled
    // is confined to the enrollment page until it has a second factor. Gating here
    // covers admin pages *and* server-action POSTs (both hit /admin/*) in one place.
    if (token?.mustSetupTotp && pathname !== "/admin/setup-totp") {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/setup-totp";
      url.search = "";
      return NextResponse.redirect(url);
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
