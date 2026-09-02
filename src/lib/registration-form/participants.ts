import { type FormField, type MemberSubfield } from "./schema";

/** One human on an event's roster — the registrant, or one of their team. */
export interface Participant {
  /** 1-based across the whole event, so the list numbers straight down. */
  index: number;
  name: string;
  roll: string;
  department: string | null;
  year: string | null;
  email: string | null;
  phone: string | null;
  /** No team block on the form → "solo"; otherwise leader vs member. */
  role: "solo" | "leader" | "member";
  /** 1-based registration this person belongs to. */
  team: number;
  /** The registrant's name, so a member row says whose team it is. */
  teamOf: string;
}

/** The subset of a registration this module needs — keeps it free of the DB row. */
export interface RosterEntry {
  name: string;
  roll: string;
  department: string | null;
  year: number | string | null;
  email: string | null;
  phone: string | null;
  customAnswers: Record<string, unknown> | null;
}

const str = (v: unknown): string => (v == null ? "" : String(v).trim());

/**
 * Which member subfield holds what. Kind pins roll/email/phone; the rest are
 * plain short_text, so name/department/year fall back to matching the label the
 * club wrote ("Team Member Name", "VTU number", "Year"…). Name last-resorts to
 * the first text subfield, since every roster has one.
 */
function memberKeys(subs: MemberSubfield[]) {
  const byKind = (k: MemberSubfield["kind"]) => subs.find((s) => s.kind === k)?.key ?? null;
  const byLabel = (re: RegExp) =>
    subs.find((s) => s.kind === "short_text" && re.test(s.label))?.key ?? null;
  const text = subs.filter((s) => s.kind === "short_text");
  return {
    name: byLabel(/name/i) ?? text[0]?.key ?? null,
    roll: byKind("roll") ?? byLabel(/roll|vtu|reg(istration)?\s*(no|number)/i),
    email: byKind("email") ?? byLabel(/e-?mail/i),
    phone: byKind("phone") ?? byLabel(/phone|mobile|contact/i),
    department: byLabel(/dep(artmen)?t|branch/i),
    year: byLabel(/^year|study year/i),
  };
}

/**
 * Flatten registrations into one numbered list of people.
 *
 * The registrant is always first in their group — on a team event they are the
 * team leader (they are the one submitting), and the team block below them
 * holds only the other members.
 */
export function listParticipants(entries: RosterEntry[], schema: FormField[]): Participant[] {
  const team = schema.find((f) => f.kind === "team");
  const subs = team?.members ?? [];
  const keys = memberKeys(subs);
  const out: Participant[] = [];

  entries.forEach((entry, i) => {
    const teamNo = i + 1;
    const who = entry.name || entry.roll || "—";
    out.push({
      index: out.length + 1,
      name: entry.name,
      roll: entry.roll,
      department: entry.department,
      year: entry.year == null || entry.year === "" ? null : String(entry.year),
      email: entry.email || null,
      phone: entry.phone || null,
      role: team ? "leader" : "solo",
      team: teamNo,
      teamOf: who,
    });
    if (!team) return;

    const rows = entry.customAnswers?.[team.id];
    if (!Array.isArray(rows)) return;
    for (const raw of rows) {
      if (!raw || typeof raw !== "object") continue;
      const m = raw as Record<string, unknown>;
      const pick = (k: string | null) => (k ? str(m[k]) : "");
      const name = pick(keys.name);
      const roll = pick(keys.roll);
      // A member the student started and left blank is not a person — skip it.
      if (!name && !roll) continue;
      out.push({
        index: out.length + 1,
        name,
        roll,
        department: pick(keys.department) || null,
        year: pick(keys.year) || null,
        email: pick(keys.email) || null,
        phone: pick(keys.phone) || null,
        role: "member",
        team: teamNo,
        teamOf: who,
      });
    }
  });

  return out;
}
