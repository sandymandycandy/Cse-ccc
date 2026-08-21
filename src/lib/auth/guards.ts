import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  type AdminRole,
  type Capability,
  canManage,
  canView,
} from "@/lib/auth/capabilities";

/**
 * Authorisation layer 2 (SECURITY_SPEC §4): every admin page and every
 * `app/api/admin/*` handler re-checks the session and capability itself —
 * middleware is not trusted for APIs. Club scope is read fresh from the DB,
 * never from the request body.
 */

export interface AdminSession {
  id: string;
  role: AdminRole;
  clubId: string | null;
  email: string;
  name: string;
}

/**
 * The authoritative session check. Verifies the JWT is backed by a live account
 * and that its `session_epoch` still matches — so deactivating a user or bumping
 * their epoch invalidates every outstanding session on the next request (§3).
 * Returns null when the session is missing, stale, or revoked.
 */
export const getAdminSession = cache(async function getAdminSession(): Promise<AdminSession | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_users")
    .select("id, email, full_name, role, club_id, is_active, session_epoch")
    .eq("id", session.user.id)
    .maybeSingle();

  if (!data || !data.is_active) return null;
  if (data.session_epoch !== session.user.sessionEpoch) return null; // revoked

  return {
    id: data.id,
    role: data.role,
    clubId: data.club_id,
    email: data.email,
    name: data.full_name,
  };
});

// ── page guards (redirect on failure) ────────────────────────────────────────

/** For admin *pages*: redirect to login if unauthenticated. */
export async function requireAdminPage(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}

/** For admin pages needing view access to a capability's surface. */
export async function requireViewPage(cap: Capability): Promise<AdminSession> {
  const session = await requireAdminPage();
  if (!canView(session, cap)) redirect("/admin");
  return session;
}

// ── route-handler guards (return a Response on failure) ──────────────────────

export type Guard =
  | { ok: true; session: AdminSession }
  | { ok: false; response: Response };

const deny = (status: number, error: string): Guard => ({
  ok: false,
  response: Response.json({ error }, { status }),
});

/** Require any valid admin session. */
export async function requireSession(): Promise<Guard> {
  const session = await getAdminSession();
  if (!session) return deny(401, "Not signed in.");
  return { ok: true, session };
}

/** Require the session's role to be one of `roles`. */
export async function requireRole(roles: AdminRole[]): Promise<Guard> {
  const g = await requireSession();
  if (!g.ok) return g;
  if (!roles.includes(g.session.role)) return deny(403, "Not permitted.");
  return g;
}

/**
 * Require capability `cap`. For club-scoped grants (`own`), pass the resource's
 * owning club id — read from the DB by the caller, never from the request body.
 */
export async function requireCapability(
  cap: Capability,
  resourceClubId?: string | null,
): Promise<Guard> {
  const g = await requireSession();
  if (!g.ok) return g;
  if (!canManage(g.session, cap, resourceClubId)) return deny(403, "Not permitted.");
  return g;
}

// ── CSRF (SECURITY_SPEC §7) ──────────────────────────────────────────────────

/**
 * Reject cross-site mutations. SameSite=Lax already blocks the classic
 * cross-site form post; on top of that every mutating admin request must carry
 * an `Origin` that matches the site. A request with no Origin is rejected.
 * (The double-submit token pairs with this once the admin UI issues it.)
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const site =
    process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  try {
    return new URL(origin).origin === new URL(site).origin;
  } catch {
    return false;
  }
}

/**
 * Guard form of {@link sameOrigin}: returns a 403 Response to return early, or
 * null to proceed. Use at the top of every mutating admin handler.
 */
export function requireSameOrigin(request: Request): Response | null {
  return sameOrigin(request) ? null : Response.json({ error: "Bad origin." }, { status: 403 });
}
