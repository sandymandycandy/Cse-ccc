/**
 * Case-insensitive match of a member against an attendance search query, by
 * name OR roll number. An empty / whitespace-only query matches everything.
 *
 * Pure and client-safe (no `server-only`) — the attendance roster, members, and
 * session-marking search boxes all run this in the browser over already-loaded
 * rows, so the filter is instant and needs no server round-trip.
 */
export function matchesQuery(name: string, rollNo: string | null, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  if (name.toLowerCase().includes(needle)) return true;
  if (rollNo != null && rollNo.toLowerCase().includes(needle)) return true;
  return false;
}

/**
 * Case-insensitive free-text match of a row against a query, across EVERY value
 * on it — the identity fields, the team name, and every custom answer, walking
 * into the member objects nested inside a team block so that searching a team
 * member's name finds the team they belong to. An empty / whitespace-only query
 * matches everything.
 *
 * Pure and client-safe like {@link matchesQuery}: the registration search boxes
 * run this in the browser over already-loaded rows, so filtering is instant and
 * needs no server round-trip. Values come from JSON, so there are no cycles to
 * guard against.
 */
export function matchesAny(values: readonly unknown[], query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return values.some((v) => contains(v, needle));
}

function contains(value: unknown, needle: string): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.some((v) => contains(v, needle));
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((v) => contains(v, needle));
  }
  return String(value).toLowerCase().includes(needle);
}
