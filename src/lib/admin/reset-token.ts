/**
 * Whether a password-reset token row is still usable.
 *
 * Pure and DB-free so the rule that decides account recovery can be tested
 * directly. Deliberately NOT `server-only`: nothing here touches a secret.
 *
 * Fails CLOSED — an expiry we cannot parse is treated as dead, never as live.
 */
export function isResetLive(
  row: { expiresAt: string; consumedAt: string | null },
  now: Date,
): boolean {
  if (row.consumedAt) return false;
  const expires = new Date(row.expiresAt).getTime();
  if (Number.isNaN(expires)) return false;
  return expires > now.getTime();
}
