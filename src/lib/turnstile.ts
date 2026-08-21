import "server-only";

/**
 * Cloudflare Turnstile verification (SECURITY_SPEC §6). When no secret is
 * configured (local dev) this is skipped so the flow still works; in production
 * set TURNSTILE_SECRET_KEY and the check becomes mandatory.
 */
export async function verifyTurnstile(
  token: string | undefined,
  ip: string | null,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured — dev fallback
  if (!token) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);

  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body },
    );
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

/** Whether the client should render the Turnstile widget. */
export const turnstileEnabled = () =>
  Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
