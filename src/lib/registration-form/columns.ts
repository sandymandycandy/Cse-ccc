import { LAYOUT_KINDS, type FieldKind, type FormField } from "./schema";

export interface AnswerColumn {
  key: string;
  label: string;
  kind: FieldKind;
  get(custom: Record<string, unknown> | null): string;
}

/**
 * Flatten a form schema into response columns for the admin table and the CSV
 * (shared so they cannot diverge). Identity blocks own their fixed columns
 * elsewhere; section blocks carry no data. A team block expands to one column
 * per (member slot × subfield).
 */
export function answerColumns(schema: FormField[]): AnswerColumn[] {
  const cols: AnswerColumn[] = [];
  for (const field of schema) {
    if (field.identity || LAYOUT_KINDS.has(field.kind)) continue;

    if (field.kind === "team") {
      const max = field.maxMembers ?? 1;
      const subs = field.members ?? [];
      for (let n = 1; n <= max; n++) {
        for (const sf of subs) {
          cols.push({
            key: `${field.id}.${n}.${sf.key}`,
            label: `${field.label} — Member ${n} ${sf.label}`,
            kind: "short_text",
            get: (custom) => {
              const list = custom?.[field.id];
              const member = Array.isArray(list) ? list[n - 1] : undefined;
              const v = member && typeof member === "object"
                ? (member as Record<string, unknown>)[sf.key] : undefined;
              return v != null ? String(v) : "";
            },
          });
        }
      }
      continue;
    }

    cols.push({
      key: field.id,
      label: field.label,
      kind: field.kind,
      get: (custom) => {
        const v = custom?.[field.id];
        return Array.isArray(v) ? v.join(", ") : v != null ? String(v) : "";
      },
    });
  }
  return cols;
}
