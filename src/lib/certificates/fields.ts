import { LAYOUT_KINDS, type FormField } from "@/lib/registration-form/schema";
import { listParticipants, type RosterEntry } from "@/lib/registration-form/participants";
import type { DesignContext, FieldTransform } from "./design";
import { placeText, placeWords, type WinnerStanding } from "./winners";

/**
 * Fields a design can print (spec §2.3): what the + Field menu offers, and how
 * one recipient's values are worked out. Pure — the caller loads the rows.
 */

export type FieldValues = Record<string, string>;

export interface FieldOption {
  key: string;
  label: string;
}

export interface FieldGroup {
  id: "person" | "team" | "event" | "form" | "sheet" | "cert" | "winner";
  label: string;
  fields: FieldOption[];
}

/** The event's registration questions that describe the entry: not identity, not layout, not the team roster. */
export function answerFields(schema: FormField[]): FormField[] {
  return schema.filter((f) => !f.identity && f.kind !== "team" && !LAYOUT_KINDS.has(f.kind));
}

/** What a design for this event (and group) may reference — the input to validateDesign. */
export function designContextFor(
  schema: FormField[],
  sheetColumns: string[] = [],
  winnerFields = false,
): DesignContext {
  return {
    formFieldIds: new Set(answerFields(schema).map((f) => f.id)),
    sheetColumns: new Set(sheetColumns),
    winnerFields,
  };
}

export function hasTeamBlock(schema: FormField[]): boolean {
  return schema.some((f) => f.kind === "team");
}

export function buildFieldCatalogue(input: {
  formSchema: FormField[];
  sheetColumns?: string[];
  /** Winners groups (and the Winners base) can print the placing. */
  winnerFields?: boolean;
}): FieldGroup[] {
  const groups: FieldGroup[] = [
    {
      id: "person",
      label: "Person",
      fields: [
        { key: "person.name", label: "Name" },
        { key: "person.roll", label: "Roll / VTU no." },
        { key: "person.department", label: "Department" },
        { key: "person.year", label: "Year" },
        { key: "person.email", label: "Email" },
        { key: "person.phone", label: "Phone" },
        { key: "person.role", label: "Role" },
      ],
    },
  ];
  const teamy =
    hasTeamBlock(input.formSchema) || input.formSchema.some((f) => f.identity === "team_name");
  if (teamy) {
    groups.push({
      id: "team",
      label: "Team",
      fields: [
        { key: "team.name", label: "Team name" },
        { key: "team.members", label: "Team members" },
        { key: "team.size", label: "Team size" },
      ],
    });
  }
  groups.push({
    id: "event",
    label: "Event",
    fields: [
      { key: "event.title", label: "Event title" },
      { key: "event.date", label: "Event date" },
      { key: "event.venue", label: "Venue" },
      { key: "event.club", label: "Club name" },
    ],
  });
  const answers = answerFields(input.formSchema);
  if (answers.length > 0) {
    groups.push({
      id: "form",
      label: "Form answers",
      fields: answers.map((f) => ({ key: `form.${f.id}`, label: f.label })),
    });
  }
  if (input.winnerFields) {
    groups.push({
      id: "winner",
      label: "Winner",
      fields: [
        { key: "winner.place", label: "Position" },
        { key: "winner.placeWords", label: "Position in words" },
      ],
    });
  }
  if (input.sheetColumns?.length) {
    groups.push({
      id: "sheet",
      label: "Sheet columns",
      fields: input.sheetColumns.map((c) => ({ key: `sheet.${c}`, label: c })),
    });
  }
  groups.push({
    id: "cert",
    label: "Certificate",
    fields: [
      { key: "cert.serial", label: "Serial number" },
      { key: "cert.issueDate", label: "Issue date" },
      { key: "cert.group", label: "Group" },
    ],
  });
  return groups;
}

/** Label for a field key; falls back to the key itself for a field that no longer exists. */
export function fieldLabel(catalogue: FieldGroup[], key: string): string {
  for (const g of catalogue) {
    const hit = g.fields.find((f) => f.key === key);
    if (hit) return hit.label;
  }
  return key;
}

/**
 * "asha r" → "Asha R", "JOHN o'NEIL-SMITH" → "John O'neil-Smith".
 *
 * Opening brackets and braces are word boundaries too, so the editor's
 * `{Name}` placeholders survive a Title Case field with their label intact.
 * The apostrophe deliberately is not one — O'neil, not O'Neil.
 */
export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|[\s\-.(/[{])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function applyTransform(value: string, transform: FieldTransform): string {
  if (transform === "upper") return value.toUpperCase();
  if (transform === "title") return titleCase(value);
  return value;
}

const IST = "Asia/Kolkata";

function istParts(d: Date | string): { day: number; month: string; year: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(typeof d === "string" ? new Date(d) : d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: Number(get("day")), month: get("month"), year: Number(get("year")) };
}

/** "14 September 2026". */
export function formatIstDate(d: Date | string): string {
  const p = istParts(d);
  return `${p.day} ${p.month} ${p.year}`;
}

/** An event's date for print: one day, or the shortest honest range. */
export function formatEventDate(startsAt: string, endsAt: string | null): string {
  const a = istParts(startsAt);
  const b = endsAt ? istParts(endsAt) : a;
  if (a.year !== b.year) return `${formatIstDate(startsAt)} – ${formatIstDate(endsAt!)}`;
  if (a.month !== b.month) return `${a.day} ${a.month} – ${b.day} ${b.month} ${b.year}`;
  if (a.day !== b.day) return `${a.day}–${b.day} ${a.month} ${a.year}`;
  return formatIstDate(startsAt);
}

export interface CertEventInfo {
  title: string;
  startsAt: string;
  endsAt: string | null;
  venue: string | null;
  clubName: string | null;
}

/** The subset of a registration row this module reads. */
export interface RegistrationForFields {
  name: string;
  roll: string;
  department: string | null;
  year: number | null;
  email: string;
  phone: string | null;
  teamName: string | null;
  customAnswers: Record<string, unknown> | null;
}

function eventValues(event: CertEventInfo): FieldValues {
  return {
    "event.title": event.title,
    "event.date": formatEventDate(event.startsAt, event.endsAt),
    "event.venue": event.venue ?? "",
    "event.club": event.clubName ?? "",
  };
}

function answerValues(schema: FormField[], answers: Record<string, unknown> | null): FieldValues {
  const out: FieldValues = {};
  for (const f of answerFields(schema)) {
    const v = answers?.[f.id];
    out[`form.${f.id}`] = Array.isArray(v) ? v.map(String).join(", ") : v == null ? "" : String(v).trim();
  }
  return out;
}

const rosterEntryOf = (r: RegistrationForFields): RosterEntry => ({
  name: r.name,
  teamName: r.teamName,
  roll: r.roll,
  department: r.department,
  year: r.year,
  email: r.email,
  phone: r.phone,
  customAnswers: r.customAnswers,
});

/** Everyone on this entry — the leader first, then the members they listed. */
export function teamOf(registration: RegistrationForFields, schema: FormField[]): TeamPerson[] {
  if (!hasTeamBlock(schema)) return [];
  return listParticipants([rosterEntryOf(registration)], schema)
    .filter((p) => p.name.trim() !== "" || p.roll.trim() !== "")
    .map((p) => ({
      name: p.name.trim(),
      roll: p.roll.trim(),
      department: p.department?.trim() || null,
      year: p.year?.trim() || null,
      email: p.email?.trim() || null,
      phone: p.phone?.trim() || null,
      isLeader: p.role === "leader",
    }));
}

/** One person on a team entry, flattened out of the registration's answers. */
export interface TeamPerson {
  name: string;
  roll: string;
  department: string | null;
  year: string | null;
  email: string | null;
  phone: string | null;
  isLeader: boolean;
}

/** What the whole entry shares: its team, the event, and the answers it submitted. */
function entryValues(input: {
  event: CertEventInfo;
  schema: FormField[];
  registration: RegistrationForFields;
  groupLabel: string;
}): FieldValues {
  const team = teamOf(input.registration, input.schema);
  const isTeamEvent = hasTeamBlock(input.schema);
  return {
    "team.name": input.registration.teamName?.trim() ?? "",
    "team.members": team.map((p) => p.name).filter(Boolean).join(", "),
    "team.size": isTeamEvent ? String(team.length) : "",
    ...eventValues(input.event),
    ...answerValues(input.schema, input.registration.customAnswers),
    "cert.serial": "",
    "cert.issueDate": "",
    "cert.group": input.groupLabel,
  };
}

/**
 * Values for the person who submitted a registration — a solo participant, or
 * the leader of a team (spec §3.1). Serial and issue date are filled at issue.
 */
export function registrantValues(input: {
  event: CertEventInfo;
  schema: FormField[];
  registration: RegistrationForFields;
  groupLabel: string;
}): FieldValues {
  const r = input.registration;
  return {
    "person.name": r.name.trim(),
    "person.roll": r.roll.trim(),
    "person.department": r.department?.trim() ?? "",
    "person.year": r.year == null ? "" : String(r.year),
    "person.email": r.email.trim(),
    "person.phone": r.phone?.trim() ?? "",
    "person.role": hasTeamBlock(input.schema) ? "Team leader" : "Participant",
    ...entryValues(input),
  };
}

/**
 * Values for one member of a team: their own identity, their team's shared
 * answers. A member the form did not ask for a department simply prints none.
 */
export function memberValues(input: {
  event: CertEventInfo;
  schema: FormField[];
  registration: RegistrationForFields;
  member: TeamPerson;
  groupLabel: string;
}): FieldValues {
  const m = input.member;
  return {
    "person.name": m.name,
    "person.roll": m.roll,
    "person.department": m.department ?? "",
    "person.year": m.year ?? "",
    "person.email": m.email ?? "",
    "person.phone": m.phone ?? "",
    "person.role": "Team member",
    ...entryValues(input),
  };
}

/**
 * Values for a row of a list (volunteers, judges), typed or uploaded. An
 * upload's own columns are addressable as `sheet.<column>`. Name, email and roll
 * come from the row; the person fields a list has no value for print empty.
 */
export function sheetValues(input: {
  event: CertEventInfo;
  columns: string[];
  row: { name: string; email: string | null; roll?: string | null; data: Record<string, unknown> | null };
  groupLabel: string;
}): FieldValues {
  const columns: FieldValues = {};
  for (const column of input.columns) {
    const value = input.row.data?.[column];
    columns[`sheet.${column}`] = value == null ? "" : String(value).trim();
  }
  return {
    "person.name": input.row.name.trim(),
    "person.roll": input.row.roll?.trim() ?? "",
    "person.department": "",
    "person.year": "",
    "person.email": input.row.email?.trim() ?? "",
    "person.phone": "",
    "person.role": input.groupLabel,
    "team.name": "",
    "team.members": "",
    "team.size": "",
    ...eventValues(input.event),
    ...columns,
    "cert.serial": "",
    "cert.issueDate": "",
    "cert.group": input.groupLabel,
  };
}

/**
 * Values for one winner (spec 2026-09-15 §4.3). `standing` is the whole podium
 * entry — the team and its placing — and `person` is whoever this certificate
 * is for: the registrant, or one of their team members.
 */
export function winnerValues(input: {
  event: CertEventInfo;
  standing: WinnerStanding;
  person: { name: string; roll: string; email: string | null; department?: string | null; year?: string | null };
  groupLabel: string;
}): FieldValues {
  const { standing, person } = input;
  // The registrant leads the list, as on the public standings.
  const everyone = [standing.displayName ?? standing.rollNo, ...standing.teamMembers.map((m) => m.name)].filter(Boolean);
  const isTeam = standing.teamMembers.length > 0 || !!standing.teamName;
  return {
    "person.name": person.name.trim(),
    "person.roll": person.roll.trim(),
    "person.department": person.department?.trim() ?? "",
    "person.year": person.year?.trim() ?? "",
    "person.email": person.email?.trim() ?? "",
    "person.phone": "",
    "person.role": input.groupLabel,
    "team.name": standing.teamName?.trim() ?? "",
    "team.members": isTeam ? everyone.join(", ") : "",
    "team.size": isTeam ? String(everyone.length) : "",
    ...eventValues(input.event),
    "winner.place": placeText(standing.place),
    "winner.placeWords": placeWords(standing.place),
    "cert.serial": "",
    "cert.issueDate": "",
    "cert.group": input.groupLabel,
  };
}

/** "Field names" preview: every field shows as {Label}. */
export function fieldNameValue(catalogue: FieldGroup[]) {
  return (key: string): string => `{${fieldLabel(catalogue, key)}}`;
}
