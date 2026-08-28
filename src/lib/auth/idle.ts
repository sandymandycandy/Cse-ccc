import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Idle-session support (SECURITY_SPEC §3). Admin sessions expire after 10 minutes
 * of inactivity, on top of the JWT's 8h absolute cap. The proxy tracks activity
 * with a signed, httpOnly "last seen" cookie — deliberately separate from the
 * Auth.js session token so this logic can never corrupt the login state. A wrong
 * decision here can only send an admin back to /admin/login, never further.
 */

/** The inactivity window. */
export const IDLE_MS = 10 * 60 * 1000;

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

/** A tamper-proof last-seen cookie value: "<ms>.<hmac>". */
export function makeIdleToken(ts: number, secret: string): string {
  const v = String(ts);
  return `${v}.${sign(v, secret)}`;
}

/**
 * Verify and parse an idle token, returning its timestamp — or null if the value
 * is absent, malformed, or the signature doesn't match (a forged/expired-secret
 * cookie is treated as absent). Constant-time signature comparison.
 */
export function readIdleToken(raw: string | undefined | null, secret: string): number | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const value = raw.slice(0, dot);
  const provided = Buffer.from(raw.slice(dot + 1));
  const expected = Buffer.from(sign(value, secret));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }
  const ts = Number(value);
  return Number.isInteger(ts) && ts > 0 ? ts : null;
}

/**
 * True when a known last-seen time is older than the idle window. A null
 * last-seen (no cookie yet, e.g. immediately after login) is NOT expired — the
 * proxy starts the clock instead of bouncing a fresh session.
 */
export function isIdleExpired(lastSeen: number | null, now: number, idleMs = IDLE_MS): boolean {
  return lastSeen !== null && now - lastSeen > idleMs;
}

export type IdleAction = "proceed" | "expire";

/**
 * The full idle decision, hardened against a stripped clock cookie.
 *
 * The activity cookie alone can be deleted by anyone holding the session cookie
 * (it's httpOnly against JS, but not against devtools/network tools), which would
 * otherwise defeat the timeout entirely. So when the clock is missing or forged
 * (`lastSeen === null`) we fall back to the session's own issued-at time:
 *
 * - clock present    → expire iff it is older than the window (normal slide path)
 * - clock absent, but the session was **issued within the window** → proceed
 *   (a genuine fresh login that hasn't been stamped with a clock yet)
 * - clock absent, and the session was **issued longer ago** → expire
 *   (an aged session with no clock ⇒ the clock was stripped)
 * - clock absent, and the session age is **unknown** (`sessionIatMs === null`,
 *   e.g. the JWT couldn't be decoded) → proceed (fail-open: never worse than the
 *   pre-hardening behavior, so a decode misconfig can't brick the admin panel)
 */
export function idleAction(
  lastSeen: number | null,
  sessionIatMs: number | null,
  now: number,
  idleMs = IDLE_MS,
): IdleAction {
  if (lastSeen !== null) {
    return now - lastSeen > idleMs ? "expire" : "proceed";
  }
  if (sessionIatMs === null) return "proceed";
  return now - sessionIatMs > idleMs ? "expire" : "proceed";
}
