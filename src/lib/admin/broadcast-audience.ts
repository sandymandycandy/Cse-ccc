import { grantFor, type AdminIdentity } from "@/lib/auth/capabilities";

/**
 * Who a broadcast goes to, and who is allowed to pick that.
 *
 * Pure on purpose: this is the authorisation boundary for the largest
 * outward-facing action in the panel, and it should be provable without a
 * database, a session or a request.
 */
export type Audience =
  | { kind: "heads" }
  | { kind: "council" }
  | { kind: "club_members"; clubId: string }
  | { kind: "all_members" }
  | { kind: "event"; eventId: string; scope: "confirmed" | "all" };

/**
 * At or below this many addresses a send goes out inline, as every existing
 * mail does. Above it the send is queued: Gmail SMTP opens one connection per
 * message, so a few hundred sequential sends would run past the function limit.
 */
export const INLINE_MAX = 50;

export function shouldQueue(count: number): boolean {
  return count > INLINE_MAX;
}

export function audienceLabel(a: Audience): string {
  switch (a.kind) {
    case "heads":
      return "Club heads and vice heads";
    case "council":
      return "Council members";
    case "all_members":
      return "All club members";
    case "club_members":
      return "One club's members";
    case "event":
      return a.scope === "all"
        ? "An event's registrants, including the waitlist"
        : "An event's confirmed registrants";
  }
}

export function parseAudience(raw: {
  kind?: string | null;
  clubId?: string | null;
  eventId?: string | null;
  scope?: string | null;
}): Audience | null {
  switch (raw.kind) {
    case "heads":
      return { kind: "heads" };
    case "council":
      return { kind: "council" };
    case "all_members":
      return { kind: "all_members" };
    case "club_members":
      return raw.clubId ? { kind: "club_members", clubId: raw.clubId } : null;
    case "event":
      if (!raw.eventId) return null;
      // Anything but an explicit "all" means confirmed — the narrower audience
      // is the safe reading of an unrecognised value.
      return {
        kind: "event",
        eventId: raw.eventId,
        scope: raw.scope === "all" ? "all" : "confirmed",
      };
    default:
      return null;
  }
}

/**
 * `resourceClubId` is the club the DATABASE says owns the event — never a value
 * the form supplied. It is ignored for the non-event audiences.
 */
export function isAudienceAllowed(
  id: AdminIdentity,
  a: Audience,
  resourceClubId: string | null,
): boolean {
  const grant = grantFor(id.role, "manage:broadcast");
  if (grant === "all") return true;
  if (grant !== "own") return false;
  // Fail closed: a club-scoped admin with no club reaches nothing.
  if (id.clubId == null) return false;

  // An `own` holder reaches their own club's members and their own club's
  // events. The council-wide lists are not theirs to mail.
  if (a.kind === "club_members") return a.clubId === id.clubId;
  if (a.kind === "event") return resourceClubId != null && resourceClubId === id.clubId;
  return false;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One address is mailed once, whichever list it turned up on. First name wins. */
export function dedupeRecipients(
  list: { email: string; name: string | null }[],
): { email: string; name: string | null }[] {
  const seen = new Set<string>();
  const out: { email: string; name: string | null }[] = [];
  for (const r of list) {
    const email = String(r.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, name: r.name });
  }
  return out;
}
