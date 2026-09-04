import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { grantFor } from "@/lib/auth/capabilities";
import { generateConfirmToken, hashToken } from "@/lib/tokens";
import type { AdminRole } from "@/lib/auth/capabilities";

/**
 * Admin onboarding invites (SECURITY_SPEC §3). A single-use 32-byte token is
 * generated, stored only as its SHA-256 hash, and expires in 48h. Consuming it
 * (in the accept flow) is what sets the admin's password + TOTP — no password is
 * ever emailed, and no account has a usable hash until its invite is consumed.
 */

const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

export async function createInvite(input: {
  email: string;
  role: AdminRole;
  clubId: string | null;
  createdBy: string;
}): Promise<{ token: string; expiresAt: string }> {
  const admin = createAdminClient();
  const { raw, hash } = generateConfirmToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  const { error } = await admin.from("admin_invites").insert({
    email: input.email.trim().toLowerCase(),
    role: input.role,
    club_id: input.clubId,
    token_hash: hash,
    expires_at: expiresAt,
    created_by: input.createdBy,
  });
  if (error) throw error;
  return { token: raw, expiresAt };
}

export interface ValidatedInvite {
  id: string;
  email: string;
  role: AdminRole;
  clubId: string | null;
}

/** A live invite for `rawToken`, or null if unknown / expired / already used. */
export async function validateInvite(rawToken: string): Promise<ValidatedInvite | null> {
  if (!rawToken) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_invites")
    .select("id, email, role, club_id, expires_at, consumed_at")
    .eq("token_hash", hashToken(rawToken))
    .maybeSingle();
  if (!data || data.consumed_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return { id: data.id, email: data.email, role: data.role, clubId: data.club_id };
}

/** Atomically mark an invite consumed. Returns false if it was already used. */
export async function consumeInvite(inviteId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_invites")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", inviteId)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  return !!data;
}

export interface AdminListRow {
  id: string;
  email: string;
  name: string;
  role: string;
  /** Grouping keys on this, never on `club` — two clubs can share a short_name. */
  clubId: string | null;
  club: string | null;
  isActive: boolean;
  hasTotp: boolean;
}

/** All admin accounts, for the user-management page. */
/**
 * ⚠️ The `clubs` embed MUST name its foreign key. Do not "simplify" it back to
 * `clubs ( short_name )`.
 *
 * There are THREE foreign-key paths between `admin_users` and `clubs`:
 * `admin_users.club_id → clubs.id` (the one we want), plus
 * `clubs.feedback_head_id` and `clubs.feedback_vice_head_id`, both added by
 * migration `20260904000000_club_feedback`. That migration turned a
 * previously-unambiguous embed on a completely unrelated page into
 * PGRST201 ("Could not embed because more than one relationship was found"),
 * which took `/admin/users` down with the admin error boundary.
 *
 * PostgREST resolves embeds at request time against the live schema, so
 * typecheck, lint, the suite and the build all stayed green while the page was
 * broken in production. `invites.test.ts` pins the shape of this string because
 * that is the only layer that can catch it.
 *
 * `admin_totp` needs no hint: it has a single FK to `admin_users`.
 */
export const ADMIN_LIST_SELECT =
  "id, email, full_name, role, is_active, club_id, " +
  "clubs!admin_users_club_id_fkey ( name, short_name ), admin_totp ( confirmed_at )";

export async function listAdmins(): Promise<AdminListRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_users")
    .select(ADMIN_LIST_SELECT)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (
    (data ?? []) as unknown as {
      id: string;
      email: string;
      full_name: string;
      role: string;
      is_active: boolean;
      club_id: string | null;
      clubs: { name: string; short_name: string } | null;
      admin_totp: { confirmed_at: string | null } | null;
    }[]
  ).map((a) => ({
    id: a.id,
    email: a.email,
    name: a.full_name,
    role: a.role,
    clubId: a.club_id,
    // Full name, not short_name: two clubs really do share the short name
    // "Animatrix", and two identical group headings defeat the grouping.
    club: a.clubs?.name ?? a.clubs?.short_name ?? null,
    isActive: a.is_active,
    hasTotp: !!a.admin_totp?.confirmed_at,
  }));
}

export interface InviteListRow {
  email: string;
  role: string;
  expiresAt: string;
}

/** Outstanding (unconsumed, unexpired) invites. */
export async function listPendingInvites(): Promise<InviteListRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_invites")
    .select("email, role, expires_at")
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((i) => ({
    email: i.email,
    role: i.role,
    expiresAt: i.expires_at,
  }));
}

/**
 * Enable or disable an admin account.
 *
 * Disabling is how access is removed: `getAdminSession` already refuses any
 * session whose account is inactive, so this takes effect on the target's very
 * next request across every device. See `admin-status.ts` for why there is no
 * hard delete and why no `session_epoch` bump is needed.
 *
 * Returns the previous value so the caller can write a truthful audit entry
 * (and can tell a real change from a no-op double click).
 */
export async function setAdminActive(id: string, isActive: boolean): Promise<boolean | null> {
  const admin = createAdminClient();
  const { data: before, error: readErr } = await admin
    .from("admin_users")
    .select("is_active")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!before) return null;

  const { error } = await admin
    .from("admin_users")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw error;
  return before.is_active;
}

/**
 * IDs of every ACTIVE admin who can manage admins — the set `canDeactivate`
 * checks against, so the council can never disable its own last keyholder.
 *
 * Derived from the capability matrix rather than a hardcoded role list: if a
 * role gains or loses `manage:admins`, this follows automatically.
 */
export async function activeKeyholderIds(): Promise<string[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_users")
    .select("id, role")
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? [])
    .filter((a) => grantFor(a.role, "manage:admins") !== "none")
    .map((a) => a.id);
}
