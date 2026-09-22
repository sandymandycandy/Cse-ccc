import { MAX_FIELDS, type FormField } from "./schema";

export function moveFormField(fields: FormField[], index: number, direction: -1 | 1): FormField[] {
  const target = index + direction;
  if (index < 0 || index >= fields.length || target < 0 || target >= fields.length) return fields;
  const next = [...fields];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function canRestoreField(fields: FormField[], field: FormField): boolean {
  return fields.length < MAX_FIELDS && !fields.some((item) =>
    item.id === field.id || (field.identity !== null && item.identity === field.identity),
  );
}

export function restoreFormField(fields: FormField[], field: FormField, index: number): FormField[] {
  if (!canRestoreField(fields, field)) return fields;
  const next = [...fields];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, field);
  return next;
}
