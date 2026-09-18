// Maintenance mode for the public site.
//
// Flipped with the MAINTENANCE_MODE environment variable and enforced in
// src/proxy.ts, which runs before any page renders — so while it is on, the
// public site makes no database queries at all. That is deliberate: the whole
// point of a maintenance page is that it still works when the thing behind it
// does not.
//
// /admin/* is exempt. Locking the council out of their own admin panel during
// maintenance is exactly backwards — maintenance is usually when they most
// need to get in.

/**
 * The committed default, used when MAINTENANCE_MODE is not set.
 *
 * This exists because changing a Vercel environment variable needs a redeploy
 * anyway, so a code constant is no slower to flip than the dashboard — and it
 * keeps the site's current state visible in git rather than hidden in project
 * settings where nobody thinks to look when the site is "down".
 *
 * ⚠️ THIS IS THE SWITCH. `true` = the public site shows the maintenance page.
 */
const DEFAULT_MAINTENANCE = false;

/**
 * MAINTENANCE_MODE wins when it says something recognisable; otherwise the
 * committed default applies. An unrecognised value (a typo, a stray space) is
 * not treated as an answer — it falls through to the default rather than
 * silently meaning "off", so a mistyped variable can't quietly un-maintenance
 * a site you deliberately took down.
 */
export function isMaintenanceMode(value: string | undefined | null): boolean {
  const v = value?.trim().toLowerCase() ?? "";
  if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return DEFAULT_MAINTENANCE;
}

/** Paths that stay reachable while maintenance is on. */
export function isExemptPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Under maintenance &middot; CSE Club Council</title>
<style>
  :root { --paper: #faf9f5; --ink: #22241f; --muted: #6b6d63; --rule: #e2e0d6; }
  @media (prefers-color-scheme: dark) {
    :root { --paper: #17190f; --ink: #f1f0e7; --muted: #9a9c8f; --rule: #33362a; }
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: "Space Grotesk", system-ui, -apple-system, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    line-height: 1.6;
  }
  main {
    max-width: 34rem;
    width: 100%;
    border: 1px solid var(--rule);
    border-radius: 4px;
    padding: clamp(1.75rem, 6vw, 3rem);
    background: var(--paper);
  }
  .tag {
    font-family: ui-monospace, "IBM Plex Mono", monospace;
    font-size: 0.75rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
    margin: 0 0 1.25rem;
  }
  h1 {
    font-family: "DM Serif Display", Georgia, serif;
    font-weight: 400;
    font-size: clamp(1.9rem, 6vw, 2.6rem);
    line-height: 1.15;
    margin: 0 0 1rem;
  }
  p { margin: 0 0 1rem; color: var(--muted); }
  p.lead { color: var(--ink); }
  hr { border: 0; border-top: 1px solid var(--rule); margin: 1.75rem 0 1.25rem; }
  .foot { font-size: 0.875rem; margin: 0; }
</style>
</head>
<body>
  <main>
    <p class="tag">CSE Club Council</p>
    <h1>We&rsquo;ll be back shortly.</h1>
    <p class="lead">The site is temporarily down for scheduled maintenance.</p>
    <p>Nothing you&rsquo;ve submitted has been lost &mdash; attendance, registrations and feedback are all safe. Please check back in a little while.</p>
    <hr>
    <p class="foot">If you need something urgently, contact your Technical Head, President or Vice Head.</p>
  </main>
</body>
</html>
`;

/**
 * A complete, dependency-free 503. `Retry-After` and `noindex` matter more than
 * they look: without them a crawler can cache the maintenance page as the site's
 * real content, and the outage outlives itself in search results.
 */
export function maintenanceResponse(): Response {
  return new Response(PAGE, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, must-revalidate",
      "retry-after": "3600",
      "x-robots-tag": "noindex",
    },
  });
}
