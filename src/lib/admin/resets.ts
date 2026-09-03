import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateConfirmToken, hashToken } from "@/lib/tokens";
import { isResetLive } from "./reset-token";

/**
 * Admin password-reset tokens (SECURITY_SPEC §3). A single-use 32-byte token is
 * generated, stored only as its SHA-256 hash, and expires in ONE HOUR — far
 * shorter than the 48h invite, because per the design's D1 this link alone is
 * sufficient to take over an account: it sets the password AND re-enrols TOTP.
 *
 * Deliberately separate from `invites.ts`: a reset carries no role and no
 * club, and can never create an account.
 */

const RESET_TTL_MS = 60 * 60 * 1000;

export async function createReset(
  email: string,
): Promise<{ token: string; expiresAt: string }> {
  const admin = createAdminClient();
  const { raw, hash } = generateConfirmToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();
  const { error } = await admin.from("admin_password_resets").insert({
    email: email.trim().toLowerCase(),
    token_hash: hash,
    expires_at: expiresAt,
  });
  if (error) throw error;
  return { token: raw, expiresAt };
}

/** A live reset for `rawToken`, or null if unknown / expired / already used. */
export async function validateReset(
  rawToken: string,
): Promise<{ id: string; email: string } | null> {
  if (!rawToken) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_password_resets")
    .select("id, email, expires_at, consumed_at")
    .eq("token_hash", hashToken(rawToken))
    .maybeSingle();
  if (!data) return null;
  if (!isResetLive({ expiresAt: data.expires_at, consumedAt: data.consumed_at }, new Date())) {
    return null;
  }
  return { id: data.id, email: data.email };
}

/**
 * Atomically mark a reset consumed. Returns false if it was already used —
 * the `.is("consumed_at", null)` filter is what makes a double-submitted link
 * apply exactly once.
 */
export async function consumeReset(resetId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_password_resets")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", resetId)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  return !!data;
}
