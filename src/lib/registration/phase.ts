export type RegPhase = "before" | "open" | "closed";

/** Pure phase decision for a registration window. `now` in ms, bounds as ISO or null. */
export function registrationPhase(
  nowMs: number,
  opensAtISO: string | null,
  closesAtISO: string | null,
): RegPhase {
  if (opensAtISO && nowMs < new Date(opensAtISO).getTime()) return "before";
  if (closesAtISO && nowMs > new Date(closesAtISO).getTime()) return "closed";
  return "open";
}
