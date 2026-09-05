/**
 * Autosave decisions for the attendance rosters.
 *
 * Marking a 200-member roster takes far longer than the 10-minute idle window
 * (`src/lib/auth/idle.ts`), and every tap used to be client-only state — so the
 * browser sent nothing for the whole session, the proxy expired the login, and
 * the Save POST was redirected to /admin/login. The action then threw, the admin
 * error boundary offered "Try again", and every mark was lost.
 *
 * Saving as the head works fixes both halves: the marks are already on the
 * server, and each save is a real /admin request, so the idle clock keeps
 * sliding while they are genuinely working. Going idle still expires the
 * session, which is the point of the timeout — it just no longer costs anything.
 *
 * Pure: no React, no DB, so the rules are unit-testable (the repo's test
 * environment is `node`, with no DOM).
 */
import { diffPresence } from "./attendance-presence";

/** True when the marks on screen differ from what the server last confirmed. */
export function isDirty(saved: ReadonlySet<string>, current: ReadonlySet<string>): boolean {
  const { toAdd, toRemove } = diffPresence(saved, current);
  return toAdd.length > 0 || toRemove.length > 0;
}

export type AutosaveAction = "save" | "wait";

/**
 * Whether to start a save now.
 *
 * One request at a time: a burst of taps must not open a request per tap, and
 * two overlapping writes to the same session could interleave their insert and
 * delete halves. The caller MUST re-run this when a save lands — the answer
 * "wait" is only true for as long as that request is open, and the taps made
 * during it are still unsaved.
 */
export function autosaveAction({
  dirty,
  inFlight,
}: {
  dirty: boolean;
  inFlight: boolean;
}): AutosaveAction {
  if (!dirty || inFlight) return "wait";
  return "save";
}
