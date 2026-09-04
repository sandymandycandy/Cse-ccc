/**
 * Admin sidebar structure — pure, so the grouping and active-link rules are
 * testable without a router or a session.
 *
 * The nav is built per-role in `admin/(app)/layout.tsx`, so its length swings
 * from 1 link (gallery_manager) to 14 (president). Those two need different
 * treatments, which is what `groupNavLinks` decides.
 */

export type NavGroup = "overview" | "programme" | "content" | "people" | "inbox" | "system";

export interface NavLink {
  href: string;
  label: string;
  group: NavGroup;
}

export interface NavSection {
  /** `null` for the flat, heading-less rendering a short nav gets. */
  label: string | null;
  links: NavLink[];
}

/** Canonical section order + the heading each one renders. */
const GROUPS: { group: NavGroup; label: string }[] = [
  { group: "overview", label: "Overview" },
  { group: "programme", label: "Programme" },
  { group: "content", label: "Content" },
  { group: "people", label: "People" },
  { group: "inbox", label: "Inbox" },
  { group: "system", label: "System" },
];

/**
 * Headings start earning their space at this many links. Below it the list is
 * short enough to scan whole, and headings would add more rows than they save.
 */
export const GROUPING_THRESHOLD = 6;

/**
 * Split links into labelled sections, or return a single unlabelled section
 * when the nav is short. Section order is canonical (never the caller's), but
 * link order *within* a section is the caller's — the layout deliberately puts
 * Events before Approvals.
 */
export function groupNavLinks(links: NavLink[]): NavSection[] {
  if (links.length === 0) return [];
  if (links.length < GROUPING_THRESHOLD) return [{ label: null, links }];

  return GROUPS.map(({ group, label }) => ({
    label,
    links: links.filter((l) => l.group === group),
  })).filter((s) => s.links.length > 0);
}

/** True when `pathname` is `href` itself or a segment below it. */
function covers(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * The single link to mark `aria-current`.
 *
 * Longest match wins. A plain `startsWith` lit up every ancestor at once —
 * on /admin/events/approvals both "Events" and "Approvals" were marked current,
 * and "/admin" would have marked the dashboard on every page in the panel.
 * Comparing on segment boundaries also keeps /admin/clubs off /admin/club.
 */
export function activeHref(links: NavLink[], pathname: string): string | null {
  let best: string | null = null;
  for (const l of links) {
    if (!covers(l.href, pathname)) continue;
    if (best === null || l.href.length > best.length) best = l.href;
  }
  return best;
}

/** Label of the current page, for the collapsed mobile bar. */
export function activeLabel(links: NavLink[], pathname: string): string | null {
  const href = activeHref(links, pathname);
  return href === null ? null : (links.find((l) => l.href === href)?.label ?? null);
}
