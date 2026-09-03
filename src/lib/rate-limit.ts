import "server-only";

/**
 * Sliding-window rate limiter (SECURITY_SPEC §6).
 *
 * In-memory implementation — the documented local/dev fallback. In production on
 * Vercel this is per-instance and resets on cold start, so before launch swap in
 * Upstash Redis (keyed identically) via UPSTASH_REDIS_REST_URL/_TOKEN. The
 * call sites don't change; only this module does.
 */

type Timestamps = number[];
const store = new Map<string, Timestamps>();

export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, max: number, windowMs: number): RateResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (store.get(key) ?? []).filter((t) => t > cutoff);

  if (hits.length >= max) {
    store.set(key, hits);
    const retryAfterSeconds = Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000));
    return { ok: false, remaining: 0, retryAfterSeconds };
  }

  hits.push(now);
  store.set(key, hits);

  // opportunistic cleanup so the map doesn't grow unbounded in a long-lived process
  if (store.size > 5000) {
    for (const [k, v] of store) {
      const live = v.filter((t) => t > cutoff);
      if (live.length === 0) store.delete(k);
      else store.set(k, live);
    }
  }

  return { ok: true, remaining: max - hits.length, retryAfterSeconds: 0 };
}

/**
 * Read-only twin of `rateLimit`: reports whether a key is currently locked and
 * for how long, WITHOUT recording a hit.
 *
 * This exists so the login form can tell the user they are locked out. Calling
 * `rateLimit` for that would count the check itself as an attempt, turning
 * three chances into two — so this function must never write to `store`.
 */
function peek(key: string, max: number, windowMs: number): RateResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (store.get(key) ?? []).filter((t) => t > cutoff);

  if (hits.length >= max) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)),
    };
  }
  return { ok: true, remaining: max - hits.length, retryAfterSeconds: 0 };
}

const MIN = 60_000;
const HOUR = 60 * MIN;

/** The registration limits from SECURITY_SPEC §6. Returns the first that trips. */
export function checkRegistrationLimits(input: {
  ip: string;
  rollNo: string;
  email: string;
}): RateResult {
  const checks: RateResult[] = [
    rateLimit(`reg:ip:${input.ip}`, 5, 10 * MIN),
    rateLimit(`reg:roll:${input.rollNo}`, 3, HOUR),
    rateLimit(`reg:email:${input.email}`, 10, HOUR),
  ];
  return checks.find((c) => !c.ok) ?? { ok: true, remaining: 0, retryAfterSeconds: 0 };
}

/**
 * Public contact-form limits: 5 per IP / 10 min, plus 5 per email / hour, so one
 * address can't flood the inbox from rotating IPs. Returns the first that trips.
 */
export function checkContactLimits(input: { ip: string; email: string }): RateResult {
  const checks: RateResult[] = [
    rateLimit(`contact:ip:${input.ip}`, 5, 10 * MIN),
    rateLimit(`contact:email:${input.email}`, 5, HOUR),
  ];
  return checks.find((c) => !c.ok) ?? { ok: true, remaining: 0, retryAfterSeconds: 0 };
}

/** Self-registration: 5 per IP / 10 min, plus 3 per roll / hour. First trip wins. */
export function checkMemberSignupLimits(input: { ip: string; roll: string }): RateResult {
  const checks: RateResult[] = [
    rateLimit(`signup:ip:${input.ip}`, 5, 10 * MIN),
    rateLimit(`signup:roll:${input.roll}`, 3, HOUR),
  ];
  return checks.find((c) => !c.ok) ?? { ok: true, remaining: 0, retryAfterSeconds: 0 };
}

/** Public roll lookup: 20 per IP / 10 min. */
export function checkRollLookupLimits(ip: string): RateResult {
  return rateLimit(`lookup:ip:${ip}`, 20, 10 * MIN);
}

/** The admin login contract: 3 attempts, then a 1-minute lockout. Shared by the
 *  consuming check and the read-only peek so the two can never disagree. */
const LOGIN_MAX = 3;
const LOGIN_WINDOW = MIN;

/**
 * Admin login limits: 3 attempts, then a 1-minute lockout — enforced per IP
 * **and** per account, so the lock survives an attacker rotating IPs. The 4th
 * attempt within the minute returns `ok: false` with `retryAfterSeconds` (≤ 60).
 */
export function checkLoginLimits(input: { ip: string; email: string }): RateResult {
  const checks: RateResult[] = [
    rateLimit(`login:ip:${input.ip}`, LOGIN_MAX, LOGIN_WINDOW),
    rateLimit(`login:acct:${input.email}`, LOGIN_MAX, LOGIN_WINDOW),
  ];
  return checks.find((c) => !c.ok) ?? { ok: true, remaining: 0, retryAfterSeconds: 0 };
}

/**
 * The same question as `checkLoginLimits`, asked without spending an attempt.
 * The login form uses this to show a countdown; `authorize` remains the only
 * place that actually consumes attempts.
 */
export function peekLoginLimits(input: { ip: string; email: string }): RateResult {
  const checks: RateResult[] = [
    peek(`login:ip:${input.ip}`, LOGIN_MAX, LOGIN_WINDOW),
    peek(`login:acct:${input.email}`, LOGIN_MAX, LOGIN_WINDOW),
  ];
  return checks.find((c) => !c.ok) ?? { ok: true, remaining: 0, retryAfterSeconds: 0 };
}

/**
 * Password-reset requests: 3 per email / hour, 5 per IP / hour.
 *
 * The per-EMAIL cap is the one that matters — per the design's D1 each mailed
 * link is on its own sufficient to take over that account, so this bounds how
 * many live tokens an attacker can cause to be sent to a mailbox they are
 * waiting on. The per-IP cap only slows spraying across many addresses.
 */
export function checkPasswordResetLimits(input: {
  ip: string;
  email: string;
}): RateResult {
  const checks: RateResult[] = [
    rateLimit(`reset:email:${input.email}`, 3, HOUR),
    rateLimit(`reset:ip:${input.ip}`, 5, HOUR),
  ];
  return checks.find((c) => !c.ok) ?? { ok: true, remaining: 0, retryAfterSeconds: 0 };
}

/**
 * Public feedback form: 10 per IP / hour. Per IP ONLY — never per VTU. A
 * per-VTU limit would quietly reintroduce the submission cap the owner declined
 * (design D3). The bound is deliberately loose because a whole class can share
 * one campus NAT address: this exists to stop a script, not a person.
 */
export function checkFeedbackLimits(input: { ip: string }): RateResult {
  return rateLimit(`feedback:ip:${input.ip}`, 10, HOUR);
}
