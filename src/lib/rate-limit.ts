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

/** Admin login limits (SECURITY_SPEC §6): 5 / 15 min per IP **and** per account. */
export function checkLoginLimits(input: { ip: string; email: string }): RateResult {
  const checks: RateResult[] = [
    rateLimit(`login:ip:${input.ip}`, 5, 15 * MIN),
    rateLimit(`login:acct:${input.email}`, 5, 15 * MIN),
  ];
  return checks.find((c) => !c.ok) ?? { ok: true, remaining: 0, retryAfterSeconds: 0 };
}
