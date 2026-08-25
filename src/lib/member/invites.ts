import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateConfirmToken, hashToken } from "@/lib/tokens";

/**
 * One-time member login links (spec §5.1) — a direct mirror of admin invites.
 * A 32-byte token is generated, stored only as its SHA-256 hash, and expires.
 * Consuming it (in the accept flow) sets the member's PIN + TOTP.
 */

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (spec §12)

export async function createMemberInvite(input: {
  memberId: string;
  createdBy: string;
}): Promise<{ token: string; expiresAt: string }> {
  const admin = createAdminClient();
  const { raw, hash } = generateConfirmToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  const { error } = await admin.from("member_invites").insert({
    member_id: input.memberId,
    token_hash: hash,
    expires_at: expiresAt,
    created_by: input.createdBy,
  });
  if (error) throw error;
  return { token: raw, expiresAt };
}

/** A live invite for `rawToken` (with the member's club), or null. */
export async function validateMemberInvite(
  rawToken: string,
): Promise<{ id: string; memberId: string; clubId: string } | null> {
  if (!rawToken) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("member_invites")
    .select("id, member_id, expires_at, consumed_at, club_members(club_id, is_active)")
    .eq("token_hash", hashToken(rawToken))
    .maybeSingle();
  if (!data || data.consumed_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  const member = data.club_members as unknown as { club_id: string; is_active: boolean } | null;
  if (!member || !member.is_active) return null;
  return { id: data.id, memberId: data.member_id, clubId: member.club_id };
}

/** Atomically mark an invite consumed. Returns false if it was already used. */
export async function consumeMemberInvite(inviteId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("member_invites")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", inviteId)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  return !!data;
}
