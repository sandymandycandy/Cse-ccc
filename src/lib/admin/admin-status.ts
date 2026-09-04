/**
 * Guards for enabling and disabling admin accounts. Pure, so the rules that
 * stop the council locking itself out are testable without a session or a
 * database.
 *
 * Deactivation is the whole mechanism for removing someone's access: setting
 * `admin_users.is_active = false` makes `getAdminSession` return null on that
 * account's very next request, on every device, because the guard already does
 * `if (!data || !data.is_active) return null`. **No `session_epoch` bump is
 * needed** — the `is_active` check is authoritative and immediate. Do not add
 * one thinking it is missing.
 *
 * Hard deletion is deliberately not offered. `admin_users` has 24 incoming
 * foreign keys: five are `NO ACTION` (attendance marks and sessions), so a
 * delete simply fails for anyone who has ever taken attendance, and
 * `audit_log.actor_id` is `ON DELETE SET NULL`, so where a delete does succeed
 * it silently anonymises that person's entire audit trail.
 */

export type Refusal = "self" | "last-keyholder";

export type DeactivateCheck = { ok: true } | { ok: false; reason: Refusal };

/**
 * May `actorId` deactivate `targetId`?
 *
 * `activeKeyholderIds` is every currently-active admin holding `manage:admins`.
 *
 * Two rules, checked in this order:
 *
 * 1. **self** — nobody may deactivate their own account. This is what actually
 *    preserves the "at least one keyholder survives" invariant: since holding
 *    the capability is what lets you press the button, the actor is always a
 *    keyholder, so the last one standing can never remove themselves.
 * 2. **last-keyholder** — nobody may remove the final active keyholder. Given
 *    rule 1 this is unreachable through the UI today, but this function knows
 *    nothing about its caller, and zero keyholders means admin management is
 *    bricked with no route back except direct database access.
 *
 * Reactivation has no guards: it only ever grants, never strands anyone.
 */
export function canDeactivate(
  actorId: string,
  targetId: string,
  activeKeyholderIds: readonly string[],
): DeactivateCheck {
  if (actorId === targetId) return { ok: false, reason: "self" };

  const remaining = activeKeyholderIds.filter((id) => id !== targetId);
  if (activeKeyholderIds.includes(targetId) && remaining.length === 0) {
    return { ok: false, reason: "last-keyholder" };
  }

  return { ok: true };
}

/** What to tell the person who tried, in their terms rather than the rule's. */
export function refusalMessage(reason: Refusal): string {
  return reason === "self"
    ? "You can't deactivate your own account. Ask another admin to do it."
    : "This is the last active account that can manage admins. Give someone else access first.";
}
