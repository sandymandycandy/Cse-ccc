import { DEPARTMENTS } from "@/lib/departments";

export type FieldKind =
  | "short_text" | "paragraph" | "dropdown" | "radio"
  | "checkboxes" | "date" | "number" | "link"
  | "section" | "team";
export type Identity = "name" | "roll" | "email" | "phone" | "department" | "year";

export interface MemberSubfield {
  key: string;
  label: string;
  kind: "short_text" | "email" | "roll" | "phone";
  required: boolean;
}

export interface FormField {
  id: string;
  kind: FieldKind;
  identity: Identity | null;
  label: string;
  help?: string;
  required: boolean;
  options?: string[];
  description?: string; // section only
  allowOther?: boolean; // choice kinds only
  members?: MemberSubfield[]; // team only
  minMembers?: number; // team only
  maxMembers?: number; // team only
}

const KINDS: ReadonlySet<string> = new Set<FieldKind>([
  "short_text", "paragraph", "dropdown", "radio", "checkboxes",
  "date", "number", "link", "section", "team",
]);
export const CHOICE_KINDS: ReadonlySet<FieldKind> = new Set(["dropdown", "radio", "checkboxes"]);
export const LAYOUT_KINDS: ReadonlySet<FieldKind> = new Set<FieldKind>(["section"]);
export const MAX_MEMBERS = 10;
export const MAX_SUBFIELDS = 8;
const MEMBER_KINDS: ReadonlySet<string> = new Set(["short_text", "email", "roll", "phone"]);
const IDENTITIES: ReadonlySet<string> = new Set<Identity>([
  "name", "roll", "email", "phone", "department", "year",
]);

/** Today's fixed six-field form, expressed as identity blocks. */
export const DEFAULT_FORM: FormField[] = [
  { id: "name", kind: "short_text", identity: "name", label: "Full name", required: true },
  { id: "roll", kind: "short_text", identity: "roll", label: "Roll number", required: true,
    help: "Used to prevent duplicate registrations." },
  { id: "email", kind: "short_text", identity: "email", label: "College email", required: true,
    help: "vtuxxxxx@veltech.edu.in" },
  { id: "phone", kind: "short_text", identity: "phone", label: "Mobile number", required: true },
  { id: "department", kind: "dropdown", identity: "department", label: "Department",
    required: true, options: [...DEPARTMENTS], allowOther: true },
  { id: "year", kind: "dropdown", identity: "year", label: "Year", required: true,
    options: ["1", "2", "3", "4", "5"] },
];

export function defaultFormFor(): FormField[] {
  return DEFAULT_FORM.map((f) => ({ ...f, options: f.options ? [...f.options] : undefined }));
}

const MAX_FIELDS = 40;

function validateMembers(
  f: Record<string, unknown>,
  id: string,
  errors: string[],
): { members: MemberSubfield[]; minMembers: number; maxMembers: number } {
  const rawMembers = Array.isArray(f.members) ? f.members : [];
  if (rawMembers.length === 0) errors.push(`Team "${id}" needs at least one member field.`);
  if (rawMembers.length > MAX_SUBFIELDS)
    errors.push(`Team "${id}" has too many member fields (max ${MAX_SUBFIELDS}).`);
  const keys = new Set<string>();
  const members: MemberSubfield[] = [];
  for (const rm of rawMembers) {
    const m = (rm ?? {}) as Record<string, unknown>;
    const key = String(m.key ?? "").trim();
    const label = String(m.label ?? "").trim();
    const kind = String(m.kind ?? "");
    if (!key) errors.push(`A member field in "${id}" is missing a key.`);
    else if (keys.has(key)) errors.push(`Duplicate member field key "${key}" in "${id}".`);
    else keys.add(key);
    if (!MEMBER_KINDS.has(kind)) errors.push(`Member field "${key}" has an unknown type.`);
    if (!label || label.length > 80) errors.push(`Member field "${key}" needs a label ≤ 80 chars.`);
    members.push({ key, label, kind: kind as MemberSubfield["kind"], required: Boolean(m.required) });
  }
  const minMembers = Number.isInteger(f.minMembers) ? (f.minMembers as number) : 1;
  const maxMembers = Number.isInteger(f.maxMembers) ? (f.maxMembers as number) : 4;
  if (minMembers < 1) errors.push(`Team "${id}" min members must be ≥ 1.`);
  if (maxMembers < minMembers) errors.push(`Team "${id}" max members must be ≥ min.`);
  if (maxMembers > MAX_MEMBERS) errors.push(`Team "${id}" max members must be ≤ ${MAX_MEMBERS}.`);
  return { members, minMembers, maxMembers };
}

export function validateFormSchema(
  input: unknown,
): { ok: true; fields: FormField[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(input)) return { ok: false, errors: ["Form must be a list of fields."] };
  if (input.length === 0) errors.push("Add at least one field.");
  if (input.length > MAX_FIELDS) errors.push(`A form can have at most ${MAX_FIELDS} fields.`);

  const ids = new Set<string>();
  const identities = new Set<string>();
  const fields: FormField[] = [];

  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) { errors.push("Malformed field."); continue; }
    const f = raw as Record<string, unknown>;
    const id = String(f.id ?? "").trim();
    const kind = String(f.kind ?? "");
    const label = String(f.label ?? "").trim();
    const identity = f.identity == null ? null : String(f.identity);

    if (!id) errors.push("A field is missing an id.");
    else if (ids.has(id)) errors.push(`Duplicate field id "${id}".`);
    else ids.add(id);

    if (!KINDS.has(kind)) errors.push(`Unknown field type "${kind}".`);
    if (!label || label.length > 120) errors.push(`Field "${id}" needs a label ≤ 120 chars.`);

    if (identity !== null) {
      if (!IDENTITIES.has(identity)) errors.push(`Unknown identity "${identity}".`);
      else if (identities.has(identity)) errors.push(`Two blocks map to "${identity}".`);
      else identities.add(identity);
    }

    const isChoice = CHOICE_KINDS.has(kind as FieldKind);
    const isSection = kind === "section";
    const isTeam = kind === "team";

    if ((isSection || isTeam) && identity !== null) {
      errors.push(`"${id}" (${kind}) cannot be an identity block.`);
    }

    const options = Array.isArray(f.options)
      ? f.options.map((o) => String(o).trim()).filter(Boolean)
      : undefined;
    if (isChoice) {
      if (!options || options.length === 0) errors.push(`"${id}" needs at least one option.`);
      else if (options.length > 20) errors.push(`"${id}" has too many options (max 20).`);
    } else if (options && options.length > 0) {
      errors.push(`"${id}" (${kind}) must not have options.`);
    }

    if (f.allowOther && !isChoice) errors.push(`"${id}" (${kind}) cannot use an "Other" option.`);

    let members: MemberSubfield[] | undefined;
    let minMembers: number | undefined;
    let maxMembers: number | undefined;
    if (isTeam) ({ members, minMembers, maxMembers } = validateMembers(f, id, errors));

    fields.push({
      id, kind: kind as FieldKind, identity: identity as Identity | null, label,
      help: f.help ? String(f.help).slice(0, 300) : undefined,
      required: isSection ? false : Boolean(f.required),
      options: isChoice ? options : undefined,
      description: isSection && f.description ? String(f.description).slice(0, 500) : undefined,
      allowOther: isChoice ? Boolean(f.allowOther) : undefined,
      members, minMembers, maxMembers,
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, fields };
}
