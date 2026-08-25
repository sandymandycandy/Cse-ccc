import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { verifyTotp, decryptSecret } from "@/lib/auth/totp";
import { isLocked, nextFailureState } from "./lockout";

export interface MemberCredRow {
  memberId: string;
  clubId: string;
  name: string;
  email: string;
  pinHash: string | null;
  totpSecretEnc: string | null;
  activatedAt: string | null;
  failedAttempts: number;
  lockedUntil: string | null;
  sessionEpoch: number;
  isActive: boolean;
}

/**
 * Look up a member (with credentials) by email, case-insensitive.
 *
 * Emails are stored lowercased (createMemberAction / updateMemberAction normalise
 * on write), so an equality match on the lowercased input is exact — and, unlike
 * PostgREST `ilike`, it does not treat `_`/`%` in the address as wildcards (a valid
 * local-part can contain `_`, e.g. `john_doe@x.com`). The `lower(email)` unique
 * index guarantees at most one match.
 */
export async function findMemberForLogin(email: string): Promise<MemberCredRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("club_members")
    .select(
      "id, club_id, name, email, is_active, club_member_auth(pin_hash, totp_secret_enc, activated_at, failed_attempts, locked_until, session_epoch)",
    )
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  if (!data) return null;
  const a = data.club_member_auth as unknown as {
    pin_hash: string | null; totp_secret_enc: string | null; activated_at: string | null;
    failed_attempts: number; locked_until: string | null; session_epoch: number;
  } | null;
  return {
    memberId: data.id, clubId: data.club_id, name: data.name, email: data.email ?? "",
    isActive: data.is_active,
    pinHash: a?.pin_hash ?? null, totpSecretEnc: a?.totp_secret_enc ?? null,
    activatedAt: a?.activated_at ?? null, failedAttempts: a?.failed_attempts ?? 0,
    lockedUntil: a?.locked_until ?? null, sessionEpoch: a?.session_epoch ?? 0,
  };
}

/** True only if the account is active, not locked, and BOTH factors verify. */
export async function verifyMemberLogin(
  row: MemberCredRow, pin: string, totp: string,
): Promise<boolean> {
  if (!row.isActive || !row.activatedAt || !row.pinHash || !row.totpSecretEnc) return false;
  if (isLocked(row.lockedUntil)) return false;
  if (!(await verifyPassword(pin, row.pinHash))) return false;
  return verifyTotp(decryptSecret(row.totpSecretEnc), totp);
}

/** Persist PIN + enrolled TOTP secret and mark the account activated. */
export async function commitSetup(input: {
  memberId: string; pin: string; encSecret: string;
}): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const pin_hash = await hashPassword(input.pin);
  // Upsert: the auth row may not exist yet if the member predates provisioning.
  const { error } = await admin.from("club_member_auth").upsert({
    member_id: input.memberId,
    pin_hash,
    totp_secret_enc: input.encSecret,
    totp_enrolled_at: now,
    activated_at: now,
    failed_attempts: 0,
    locked_until: null,
    updated_at: now,
  });
  if (error) throw error;
}

export async function recordLoginFailure(memberId: string, failedAttempts: number): Promise<void> {
  const admin = createAdminClient();
  await admin.from("club_member_auth")
    .update({ ...nextFailureState(failedAttempts), updated_at: new Date().toISOString() })
    .eq("member_id", memberId);
}

export async function resetLoginFailures(memberId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("club_member_auth")
    .update({ failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() })
    .eq("member_id", memberId);
}

/** Head-driven recovery: wipe creds and bump the epoch (kills live sessions). */
export async function resetMemberAccess(memberId: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin.from("club_member_auth")
    .select("session_epoch").eq("member_id", memberId).maybeSingle();
  const epoch = (data?.session_epoch ?? 0) + 1;
  await admin.from("club_member_auth").upsert({
    member_id: memberId,
    pin_hash: null, totp_secret_enc: null, totp_enrolled_at: null, activated_at: null,
    failed_attempts: 0, locked_until: null, session_epoch: epoch,
    updated_at: new Date().toISOString(),
  });
}

/** Provision an empty auth row when a member is created with an email. */
export async function ensureAuthRow(memberId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("club_member_auth")
    .upsert({ member_id: memberId }, { onConflict: "member_id", ignoreDuplicates: true });
}
