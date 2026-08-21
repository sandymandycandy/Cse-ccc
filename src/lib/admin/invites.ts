import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
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
  club: string | null;
  isActive: boolean;
  hasTotp: boolean;
}

/** All admin accounts, for the user-management page. */
export async function listAdmins(): Promise<AdminListRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_users")
    .select("id, email, full_name, role, is_active, clubs ( short_name ), admin_totp ( confirmed_at )")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (
    (data ?? []) as unknown as {
      id: string;
      email: string;
      full_name: string;
      role: string;
      is_active: boolean;
      clubs: { short_name: string } | null;
      admin_totp: { confirmed_at: string | null } | null;
    }[]
  ).map((a) => ({
    id: a.id,
    email: a.email,
    name: a.full_name,
    role: a.role,
    club: a.clubs?.short_name ?? null,
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
