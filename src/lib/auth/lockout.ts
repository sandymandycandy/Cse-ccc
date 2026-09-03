/**
 * Wording for the admin login lockout, shared by the server action and the
 * login page's countdown so the two never disagree.
 *
 * Deliberately NOT `server-only`: the page is a client component and re-renders
 * this string every second as the timer ticks down.
 */
export function lockoutMessage(retryAfterSeconds: number): string {
  const s = Math.max(1, Math.ceil(retryAfterSeconds));
  return `Too many attempts. Try again in ${s} second${s === 1 ? "" : "s"}.`;
}
