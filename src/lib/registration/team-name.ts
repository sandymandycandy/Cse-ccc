/**
 * One team name per event. Two teams answering to "Neural Ninjas" makes the
 * results, the certificates and the WhatsApp group ambiguous, so the API refuses
 * the second one (src/app/api/registrations/route.ts) — compared ignoring case
 * and runs of spaces.
 */

export const TEAM_NAME_TAKEN =
  "That team name is already taken for this event. Please choose another one.";

/** The form of a team name that is stored and compared: trimmed, single-spaced. */
export function teamNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** An `ilike` pattern matching exactly this name — LIKE wildcards escaped. */
export function teamNameIlike(name: string): string {
  return teamNameKey(name).replace(/[\\%_]/g, (c) => `\\${c}`);
}
