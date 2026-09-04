/**
 * The words the Club health page puts around `ClubVitality`. Pure strings, no
 * JSX, so the copy rules below are unit-testable in this repo's node
 * environment — the component is then only markup.
 *
 * ⚠️ TWO RULES HERE ARE LOAD-BEARING, not stylistic:
 *
 *   1. **A turnout figure never appears without the attendance behind it.** Same
 *      principle as `feedback-analytics.ts`: no mean without its n. `diagnosis`
 *      only emits a percentage together with `attended of eligible`.
 *   2. **`ratePct` is 0 by convention when nothing was eligible**, so a club
 *      whose members all joined after its meetings would read "0% turnout" —
 *      which invites exactly the wrong conclusion about a club that has done
 *      nothing wrong. Both helpers suppress the figure when `eligible` is 0.
 *      This mirrors the `eligible > 0` guard on the `low-turnout` flag itself.
 */
import type { ClubVitality, VitalityFlag } from "./club-vitality";

export const FLAG_LABEL: Record<VitalityFlag, string> = {
  empty: "No members",
  dormant: "Not meeting",
  // Names the behaviour, not the theory: a big club that hardly ever meets.
  "unmet-demand": "Rarely meets",
  "low-turnout": "Low turnout",
};

/** Rust for "this club is not running"; clay for "worth a look". */
export const FLAG_TONE: Record<VitalityFlag, "rejected" | "pending"> = {
  empty: "rejected",
  dormant: "rejected",
  "unmet-demand": "pending",
  "low-turnout": "pending",
};

export const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

export function lastMet(days: number | null): string {
  if (days === null) return "Never met";
  if (days === 0) return "Last met today";
  if (days === 1) return "Last met yesterday";
  return `Last met ${days} days ago`;
}

/**
 * The diagnosis line on an attention row. Assembled from facts in a fixed order
 * rather than written per flag, so it stays true for every combination.
 *
 * Returns null for a club with nothing on record at all: its badges already say
 * "No members" and "Not meeting" and the line below says "Never met", so a third
 * phrasing of the same fact is noise, not detail.
 */
export function diagnosis(r: ClubVitality): string | null {
  if (r.activeMembers === 0 && r.sessionsAllTime === 0) return null;

  const parts = [
    r.activeMembers === 0
      ? "No members"
      : `${r.activeMembers} ${plural(r.activeMembers, "member")}`,
    r.sessionsInWindow === 0
      ? "no meetings"
      : `${r.sessionsInWindow} ${plural(r.sessionsInWindow, "meeting")}`,
  ];
  if (r.eligible > 0) {
    parts.push(`${r.ratePct}% turnout (${r.attended} of ${r.eligible})`);
  }
  return parts.join(" · ");
}

/**
 * The rate as a quiet row states it. Its `n` is the MEETING COUNT, not
 * `eligible`: "43% of 292" reads as 292 members, which it is not — 292 is the
 * number of attendance slots those members were eligible for.
 */
export function turnoutSummary(r: ClubVitality): string | null {
  if (r.eligible === 0) return null;
  return `over ${r.sessionsInWindow} ${plural(r.sessionsInWindow, "meeting")}`;
}
