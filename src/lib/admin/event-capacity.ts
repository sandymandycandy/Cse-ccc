/**
 * The seat cap an event form value becomes. Blank AND 0 both mean "no limit":
 * the public page already hides the seat meter at 0, but register_for_event
 * reads 0 literally as zero seats and answers `full` to everyone — AI FORGE
 * EXPO (2026-09-24) sat at 0 and turned every registration away silently.
 */
export function capacityValue(capacity: number | "" | undefined): number | null {
  return typeof capacity === "number" && capacity > 0 ? capacity : null;
}
