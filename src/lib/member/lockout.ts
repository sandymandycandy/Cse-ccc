/** Member login brute-force lockout (spec §5.4). Pure — DB persistence lives in auth.ts. */

export const MAX_FAILED = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

/** True while a lock is still in effect. */
export function isLocked(lockedUntil: string | null, now: number = Date.now()): boolean {
  return lockedUntil !== null && new Date(lockedUntil).getTime() > now;
}

/** The row state to persist after one more failed attempt. */
export function nextFailureState(
  failedAttempts: number,
  now: number = Date.now(),
): { failed_attempts: number; locked_until: string | null } {
  const failed = failedAttempts + 1;
  return {
    failed_attempts: failed,
    locked_until: failed >= MAX_FAILED ? new Date(now + LOCKOUT_MS).toISOString() : null,
  };
}
