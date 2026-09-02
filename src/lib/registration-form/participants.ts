import { LAYOUT_KINDS, type FieldKind, type FormField, type MemberSubfield } from "./schema";

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
  /** The team's own name. Absent on solo events and on pre-2026-09 rows. */
  teamName?: string | null;
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

/** A non-identity scalar answer that belongs to the whole team — e.g. the PPT link. */
export interface TeamAnswer {
  key: string;
  label: string;
  kind: FieldKind;
  value: string;
}

/** One registration, presented as the team it actually is. */
export interface TeamGroup {
  /** 1-based, in the same order as the registrations. */
  index: number;
  /** The team's own name, or null when it has none — see {@link teamLabel}. */
  name: string | null;
  /** Leader first, then the members. One person for a solo entry. */
  people: Participant[];
  /** The team's own answers — the link and anything else the club asked for. */
  answers: TeamAnswer[];
}

/** Fields that describe the entry rather than a person: not identity, not the roster. */
function scalarFields(schema: FormField[]): FormField[] {
  return schema.filter(
    (f) => !f.identity && f.kind !== "team" && !LAYOUT_KINDS.has(f.kind),
  );
}

/**
 * Group the roster into teams so each entry reads as one unit — its people and
 * the answers it submitted together. `listParticipants` stays the flat view,
 * used for events whose form has no team block.
 */
export function listTeams(entries: RosterEntry[], schema: FormField[]): TeamGroup[] {
  const extras = scalarFields(schema);
  const byTeam = new Map<number, Participant[]>();
  for (const person of listParticipants(entries, schema)) {
    const list = byTeam.get(person.team);
    if (list) list.push(person);
    else byTeam.set(person.team, [person]);
  }
  return entries.map((entry, i) => ({
    index: i + 1,
    name: entry.teamName?.trim() ? entry.teamName.trim() : null,
    people: byTeam.get(i + 1) ?? [],
    answers: extras.map((f) => {
      const v = entry.customAnswers?.[f.id];
      return {
        key: f.id,
        label: f.label,
        kind: f.kind,
        value: Array.isArray(v) ? v.join(", ") : v != null ? String(v) : "",
      };
    }),
  }));
}

/**
 * Everything on a team card that free-text search should look at.
 *
 * Deliberately values only — never a field's label or a person's role. Those
 * are identical on every team, so matching them would match every card and make
 * the search useless. The internal indices are left out for the same reason: a
 * query of "2" should find roll VTU202, not team #2.
 */
export function teamSearchValues(team: TeamGroup): unknown[] {
  const out: unknown[] = [];
  for (const p of team.people) {
    out.push(p.name, p.roll, p.department, p.year, p.email, p.phone);
  }
  for (const a of team.answers) out.push(a.value);
  out.push(team.name);
  return out;
}

/**
 * What to head a team card with. Teams registered before the team-name field
 * existed have none, so they keep the old positional label rather than showing
 * a blank heading.
 */
export function teamLabel(team: TeamGroup): string {
  return team.name ?? `Team ${team.index}`;
}

/** A team member as published on the public results page. */
export interface PublicTeamMember {
  name: string;
  roll: string;
}

/**
 * The team members, projected down to what may appear publicly.
 *
 * The owner's line was "their name and VTU is enough", and that is the whole
 * contract: name and roll, nothing else. The member records also carry email
 * addresses and phone numbers, and this output is denormalised onto `results` —
 * a table the anon role can read. Nothing but name and roll may cross that line.
 * The leader is excluded: they are the ranked entrant, already shown by name.
 */
export function teamMembersForPublic(
  entry: RosterEntry,
  schema: FormField[],
): PublicTeamMember[] {
  return listParticipants([entry], schema)
    .filter((p) => p.role === "member" && p.name.trim() !== "")
    .map((p) => ({ name: p.name, roll: p.roll }));
}
