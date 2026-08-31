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
