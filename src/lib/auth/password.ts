import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { argon2id, argon2Verify } from "hash-wasm";

/**
 * Admin password hashing and policy — SECURITY_SPEC §3.
 *
 * Argon2id at the spec's parameters (19 MiB / 2 iterations / 1 lane). We use the
 * pure-WASM `hash-wasm` implementation deliberately: no native binary means no
 * postinstall, no per-platform build, and nothing that can drift the lockfile or
 * fail a Vercel `npm ci`. Hashes are PHC-encoded, so the salt and parameters
 * travel with the hash and `verifyPassword` needs nothing else.
 */

export const MIN_PASSWORD_LENGTH = 12;

// Spec params. memorySize is in KiB → 19 MiB.
const ARGON2 = {
  parallelism: 1,
  iterations: 2,
  memorySize: 19 * 1024,
  hashLength: 32,
} as const;

/** Hash a password to a self-describing PHC string (`$argon2id$...`). */
export async function hashPassword(password: string): Promise<string> {
  return argon2id({
    password,
    salt: randomBytes(16),
    ...ARGON2,
    outputType: "encoded",
  });
}

/** Verify a password against a stored PHC hash. Never throws on a bad hash. */
export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  try {
    return await argon2Verify({ password, hash: encodedHash });
  } catch {
    return false;
  }
}

/**
 * How many times this password appears in Have I Been Pwned, via the
 * k-anonymity range API — only the first 5 chars of the SHA-1 leave the server,
 * and `Add-Padding` hides the true result-set size. Advisory: callers treat a
 * network failure as "unknown", never as a hard block.
 */
export async function pwnedCount(password: string): Promise<number> {
  const sha1 = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { "Add-Padding": "true" },
  });
  if (!res.ok) throw new Error(`HIBP lookup failed: ${res.status}`);
  const body = await res.text();
  for (const line of body.split("\n")) {
    const [hashSuffix, count] = line.trim().split(":");
    if (hashSuffix === suffix) return Number(count) || 0;
  }
  return 0;
}

export interface PasswordCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Enforce the password policy (§3): length, then a breach check. The length
 * rule is hard; the breach check fails *open* on a network error (logged) so an
 * HIBP outage can't lock admins out of onboarding, but a known-breached password
 * is always rejected.
 */
export async function validatePassword(password: string): Promise<PasswordCheck> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  try {
    if ((await pwnedCount(password)) > 0) {
      return {
        ok: false,
        reason: "This password has appeared in a data breach. Choose another.",
      };
    }
  } catch (err) {
    console.warn("HIBP check skipped:", err instanceof Error ? err.message : err);
  }
  return { ok: true };
}
