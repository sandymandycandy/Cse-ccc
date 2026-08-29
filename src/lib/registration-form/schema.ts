import { DEPARTMENTS } from "@/lib/departments";

export type FieldKind =
  | "short_text" | "paragraph" | "dropdown" | "radio"
  | "checkboxes" | "date" | "number" | "link";
export type Identity = "name" | "roll" | "email" | "phone" | "department" | "year";

export interface FormField {
  id: string;
  kind: FieldKind;
  identity: Identity | null;
  label: string;
  help?: string;
  required: boolean;
  options?: string[];
}

const KINDS: ReadonlySet<string> = new Set<FieldKind>([
  "short_text", "paragraph", "dropdown", "radio", "checkboxes", "date", "number", "link",
]);
export const CHOICE_KINDS: ReadonlySet<FieldKind> = new Set(["dropdown", "radio", "checkboxes"]);
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
    required: true, options: [...DEPARTMENTS] },
  { id: "year", kind: "dropdown", identity: "year", label: "Year", required: true,
    options: ["1", "2", "3", "4", "5"] },
];

export function defaultFormFor(): FormField[] {
  return DEFAULT_FORM.map((f) => ({ ...f, options: f.options ? [...f.options] : undefined }));
}

const MAX_FIELDS = 40;

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
    const options = Array.isArray(f.options)
      ? f.options.map((o) => String(o).trim()).filter(Boolean)
      : undefined;
    if (isChoice) {
      if (!options || options.length === 0) errors.push(`"${id}" needs at least one option.`);
      else if (options.length > 20) errors.push(`"${id}" has too many options (max 20).`);
    } else if (options && options.length > 0) {
      errors.push(`"${id}" (${kind}) must not have options.`);
    }

    fields.push({
      id, kind: kind as FieldKind, identity: identity as Identity | null, label,
      help: f.help ? String(f.help).slice(0, 300) : undefined,
      required: Boolean(f.required),
      options: isChoice ? options : undefined,
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, fields };
}
