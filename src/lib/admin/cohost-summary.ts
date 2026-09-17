/**
 * The label on the closed co-host dropdown: enough to know the answer without
 * opening it, short enough to sit on one line next to a chevron.
 *
 * Names the first club and counts the rest rather than listing them — the
 * council's club names run to "Short Film & Movie Appreciation Club", so two
 * spelled out would wrap the control on a phone. The full set is visible as
 * chips underneath, and inside the panel.
 *
 * Pure and client-safe.
 */
export function cohostSummary(names: readonly string[]): string {
  if (names.length === 0) return "No co-hosts";
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}
