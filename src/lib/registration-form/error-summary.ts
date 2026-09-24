import type { FormField } from "./schema";

/**
 * The server's per-field complaints as a list a student can act on: "<question>:
 * <problem>", in the order the questions appear. Shown next to the Register
 * button, because the per-field hints can be a long scroll away on a big form —
 * and a rejected answer the student never sees looks like a broken button.
 */
export function errorSummary(
  fields: FormField[],
  errors: Record<string, string>,
): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  for (const f of fields) {
    if (errors[f.id]) out.push({ id: f.id, text: `${f.label}: ${errors[f.id]}` });
  }
  const known = new Set(fields.map((f) => f.id));
  for (const [id, msg] of Object.entries(errors)) {
    if (!known.has(id)) out.push({ id, text: msg });
  }
  return out;
}
