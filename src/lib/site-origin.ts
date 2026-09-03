import "server-only";

/**
 * The site's own origin, from configuration only.
 *
 * ⚠️ NEVER derive a credential-bearing link's origin from the request's `Host`
 * header. Both the admin invite and the password reset mail a single-use token
 * that is, on its own, enough to take over an admin account — so a spoofed
 * `Host` would deliver that token to an attacker's domain (password-reset /
 * invite host-header poisoning).
 *
 * `NEXT_PUBLIC_SITE_URL` is required and URL-validated (`src/lib/env.ts`), so
 * this returns null only if the environment has regressed. Callers must FAIL
 * CLOSED on null: not sending a link costs one confusing non-delivery, while
 * sending a poisoned one costs the whole account.
 */
export function siteOrigin(): string | null {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured) return null;
  try {
    return new URL(configured).origin;
  } catch {
    return null;
  }
}
