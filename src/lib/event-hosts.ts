/**
 * How an event's hosting clubs read on the page. Pure and client-safe.
 *
 * Display only. Who may act on a co-hosted event is decided in
 * `@/lib/admin/event-hosts`, never from these strings.
 */

/** Hosting clubs from `event_clubs` rows: primary first, co-hosts in the order given. */
export function orderHosts<C>(
  links: readonly { is_primary: boolean; clubs: C | null }[] | null | undefined,
): C[] {
  const rows = links ?? [];
  const at = rows.findIndex((l) => l.is_primary);
  const ordered = at > 0 ? [rows[at], ...rows.filter((_, i) => i !== at)] : rows;
  return ordered.map((l) => l.clubs).filter((c): c is C => c != null);
}

/**
 * "Coding × Ai Forge", primary first. Empty when there are no hosts, so each
 * caller keeps the fallback it already had ("CSE Council", "Council", "—").
 */
export function hostLabel(names: readonly string[]): string {
  return names.filter((n) => n.trim() !== "").join(" × ");
}

/**
 * The event page's explicit sentence, so nobody has to interpret the ×.
 * Null for a single host: the club name above the title already says it.
 */
export function hostedByLine(names: readonly string[]): string | null {
  if (names.length < 2) return null;
  const [owner, ...rest] = names;
  const others =
    rest.length === 1
      ? rest[0]
      : `${rest.slice(0, -1).join(", ")} and ${rest[rest.length - 1]}`;
  return `Hosted by ${owner} with ${others}`;
}
