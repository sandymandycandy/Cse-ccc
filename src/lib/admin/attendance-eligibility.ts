/**
 * Who may be marked present at an event. Feature A's selection mode decides:
 * a `seats` event admits every confirmed registrant; a `shortlist` event admits
 * only the shortlisted ones. Pure — shared by the registrations page (to show the
 * Mark-present control) and `toggleAttendanceAction` (to guard the write).
 */
export type SelectionMode = "seats" | "shortlist";

export function isAttendanceEligible(
  reg: { shortlistedAt: string | null },
  selectionMode: SelectionMode,
): boolean {
  if (selectionMode === "seats") return true;
  return reg.shortlistedAt != null;
}
