/**
 * Per-person event attendance, as one pure rule set shared by the actions, the
 * registrations board, certificates and the CSV export.
 *
 * `attended` means the team (or solo registrant) showed up. `absent` lists the
 * team positions — index into teamOf(), leader = 0 — that did not. Present is
 * the default: an attended team with no absentees is everyone present, which is
 * how every row written before per-person marking reads.
 */
export type TeamMark = "unmarked" | "present" | "partial";

export function normaliseAbsent(size: number, absent: readonly number[]): number[] {
  return [...new Set(absent)]
    .filter((p) => Number.isInteger(p) && p >= 0 && p < size)
    .sort((a, b) => a - b);
}

export function teamMark(size: number, attended: boolean, absent: readonly number[]): TeamMark {
  if (!attended) return "unmarked";
  return normaliseAbsent(size, absent).length > 0 ? "partial" : "present";
}

export function presentPositions(size: number, attended: boolean, absent: readonly number[]): number[] {
  if (!attended) return [];
  const out = new Set(normaliseAbsent(size, absent));
  return Array.from({ length: size }, (_, i) => i).filter((i) => !out.has(i));
}

/** Apply one person's toggle. Null when the position is not on the team. */
export function setPerson(
  size: number,
  current: { attended: boolean; absent: readonly number[] },
  position: number,
  present: boolean,
): { attended: boolean; absent: number[] } | null {
  if (!Number.isInteger(position) || position < 0 || position >= size) return null;
  const base = current.attended ? normaliseAbsent(size, current.absent) : [];
  const absent = present ? base.filter((p) => p !== position) : normaliseAbsent(size, [...base, position]);
  // Nobody came → the team did not attend.
  if (absent.length >= size) return { attended: false, absent: [] };
  return { attended: true, absent };
}

export function presentOf<T>(people: readonly T[], attended: boolean, absent: readonly number[]): T[] {
  const keep = new Set(presentPositions(people.length, attended, absent));
  return people.filter((_, i) => keep.has(i));
}
