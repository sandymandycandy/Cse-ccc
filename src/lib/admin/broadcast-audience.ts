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
  | { kind: "office_bearers" }
  | { kind: "club_members"; clubId: string }
  | { kind: "all_members" }
  | { kind: "event"; eventId: string; scope: "confirmed" | "all" }
  | { kind: "custom"; emails: string[] };

/**
 * Layer 2 — the council's office-bearers, as ROLES rather than as a list of
 * people. Resolving by role means the group self-corrects when someone is
 * appointed or leaves, instead of going stale in a constant that nobody
 * remembers to edit when next year's team takes over.
 *
 * ⚠️ A role with no holder simply contributes nobody. At the time of writing
 * `events_head` is vacant in `admin_users`, so this reaches 6, not 7.
 */
export const OFFICE_BEARER_ROLES = [
  "president",
  "vice_president",
  "tech_head",
  "events_head",
  "docs_head",
  "social_media_head",
] as const;

/**
 * Most addresses anyone may paste into one send.
 *
 * Not a performance limit — `shouldQueue` already handles size. It is here so
 * that the one audience which can reach people outside the system entirely
 * cannot become a channel for a scraped list.
 */
export const CUSTOM_MAX = 200;

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
    case "office_bearers":
      return "Council office-bearers";
    case "all_members":
      return "All club members";
    case "custom":
      return `${a.emails.length} typed address${a.emails.length === 1 ? "" : "es"}`;
    case "club_members":
      return "One club's members";
    case "event":
      return a.scope === "all"
        ? "An event's registrants, including the waitlist"
        : "An event's confirmed registrants";
  }
}

/**
 * Split a typed blob into addresses: commas, semicolons, spaces and newlines
 * all separate, because this is a field people paste into from a spreadsheet,
 * a WhatsApp message or another mail client.
 *
 * Lowercased and deduped so one person cannot be mailed twice by typing their
 * address in two different cases.
 */
export function parseEmailList(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(/[\s,;]+/)) {
    const email = part.trim().toLowerCase();
    if (EMAIL_RE.test(email)) seen.add(email);
  }
  return [...seen];
}

export function parseAudience(raw: {
  kind?: string | null;
  clubId?: string | null;
  eventId?: string | null;
  scope?: string | null;
  emails?: string | null;
}): Audience | null {
  switch (raw.kind) {
    case "heads":
      return { kind: "heads" };
    case "council":
      return { kind: "council" };
    case "office_bearers":
      return { kind: "office_bearers" };
    case "all_members":
      return { kind: "all_members" };
    case "custom": {
      const emails = parseEmailList(raw.emails ?? "");
      // Refuse an over-long list rather than truncating it: quietly mailing the
      // first 200 of 300 pasted addresses is worse than not sending at all,
      // because nobody would notice the 100 who were dropped.
      if (emails.length === 0 || emails.length > CUSTOM_MAX) return null;
      return { kind: "custom", emails };
    }
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
  //
  // ⚠️ Spelled out rather than left to the `return false` below. These are
  // authorisation decisions, and an authorisation decision that holds only
  // because of where it sits in a function is one refactor away from becoming
  // a hole. `custom` matters most: it is the only audience that can reach an
  // address outside the system entirely, so it is the one clean escape from
  // the club scope every other audience keeps an `own` holder inside.
  if (
    a.kind === "heads" ||
    a.kind === "council" ||
    a.kind === "office_bearers" ||
    a.kind === "all_members" ||
    a.kind === "custom"
  ) {
    return false;
  }

  if (a.kind === "club_members") return a.clubId === id.clubId;
  if (a.kind === "event") return resourceClubId != null && resourceClubId === id.clubId;
  return false;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Remove the people who were unticked in the picker.
 *
 * ⚠️ SUBTRACTS ONLY, and that is the whole point. The form posts who was
 * EXCLUDED, never who was included, so the server stays the authority on who
 * is in an audience and this can only ever make a send smaller. Were it the
 * other way round, the posted list would be the source of truth for
 * recipients, and a tampered request could put any address into a send —
 * walking straight around `isAudienceAllowed`.
 */
export function applyExclusions(
  recipients: { email: string; name: string | null }[],
  excluded: string[],
): { email: string; name: string | null }[] {
  if (excluded.length === 0) return recipients;
  const drop = new Set(excluded.map((e) => String(e ?? "").trim().toLowerCase()));
  return recipients.filter((r) => !drop.has(r.email.trim().toLowerCase()));
}

/**
 * One address is mailed once, whichever list it turned up on. First name wins.
 *
 * Generic so a caller can carry extra fields through — the picker needs each
 * person's role and club alongside the address, and an earlier non-generic
 * version silently dropped them by rebuilding `{ email, name }`.
 */
export function dedupeRecipients<T extends { email: string; name: string | null }>(
  list: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of list) {
    const email = String(r.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({ ...r, email });
  }
  return out;
}
