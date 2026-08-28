/**
 * Pure diff between the present-set already stored for a session and the set the
 * head just submitted. Kept free of DB/`server-only` imports so it is unit-testable
 * (mirrors the attendance-math extraction). `toAdd` → insert club_attendance rows;
 * `toRemove` → delete them.
 */
export function diffPresence(
  current: ReadonlySet<string>,
  desired: ReadonlySet<string>,
): { toAdd: string[]; toRemove: string[] } {
  const toAdd = [...desired].filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !desired.has(id));
  return { toAdd, toRemove };
}
