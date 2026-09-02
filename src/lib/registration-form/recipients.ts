import { type FormField } from "./schema";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Everyone who should hear about a registration: the registrant's email plus
 * every team-member email captured in the stored answers. Deduped, lowercased,
 * validated, capped.
 *
 * Used by every registrant-facing mail — confirmation, shortlist, waitlist
 * promotion, cancellation and admin broadcasts — because a teammate who never
 * hears that the event moved or was cancelled is the whole problem this solves.
 * Only the registrant's address is guaranteed; member emails exist only when the
 * club asked for them.
 */
export function teamRecipients(
  schema: FormField[],
  custom: Record<string, unknown> | null,
  leaderEmail: string | null | undefined,
  cap = 12,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (e: unknown) => {
    const v = String(e ?? "").trim().toLowerCase();
    if (v && EMAIL_RE.test(v) && !seen.has(v)) { seen.add(v); out.push(v); }
  };

  add(leaderEmail);
  for (const field of schema) {
    if (field.kind !== "team") continue;
    const emailKeys = (field.members ?? []).filter((s) => s.kind === "email").map((s) => s.key);
    const list = custom?.[field.id];
    if (!Array.isArray(list)) continue;
    for (const member of list) {
      if (member && typeof member === "object") {
        for (const k of emailKeys) add((member as Record<string, unknown>)[k]);
      }
    }
  }
  return out.slice(0, cap);
}
