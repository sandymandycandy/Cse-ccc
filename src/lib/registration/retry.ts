export type RetryOutcome =
  | { kind: "http"; status: number }
  | { kind: "network" }
  | { kind: "status"; status: string };

export const MAX_ATTEMPTS = 8;
const BASE_MS = 400;
const CAP_MS = 4000;
const JITTER_MS = 400;

/** Retry only transient outcomes; every terminal registration result stops the loop. */
export function shouldRetry(outcome: RetryOutcome): boolean {
  if (outcome.kind === "network") return true;
  if (outcome.kind === "http") return outcome.status === 429 || outcome.status === 503;
  return outcome.status === "not_open";
}

/** Capped exponential backoff with additive jitter; Retry-After (s) wins when present. */
export function nextDelay(attempt: number, retryAfterSeconds?: number): number {
  if (retryAfterSeconds != null && retryAfterSeconds > 0) {
    return Math.round(retryAfterSeconds * 1000);
  }
  const backoff = Math.min(CAP_MS, BASE_MS * 2 ** attempt);
  return backoff + Math.floor(Math.random() * JITTER_MS);
}
