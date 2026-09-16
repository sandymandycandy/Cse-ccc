import type { FieldErrors } from "@/lib/admin/form-state";

/**
 * The complaint about one input, rendered under it.
 *
 * Renders nothing when that field is fine, so a form can put one of these
 * under every input unconditionally.
 *
 * ⚠️ Pair it with `fieldProps(errors, name)` on the input itself, and put the
 * `err` class on the wrapping `.field` — the red border and red text come from
 * `.field.err` in globals.css, not from this component.
 */
export function FieldError({ errors, name }: { errors?: FieldErrors; name: string }) {
  const message = errors?.[name];
  if (!message) return null;
  return (
    <span className="hint field-err" id={`${name}-err`} role="alert">
      {message}
    </span>
  );
}

/**
 * The attributes an input needs so assistive tech reads the same complaint a
 * sighted person sees: `aria-invalid` marks it wrong, `aria-describedby`
 * points at the `FieldError` above.
 */
export function fieldProps(errors: FieldErrors | undefined, name: string) {
  return errors?.[name]
    ? { "aria-invalid": true as const, "aria-describedby": `${name}-err` }
    : {};
}

/** `className` for the wrapping `.field`, adding `err` when this one is wrong. */
export function fieldClass(errors: FieldErrors | undefined, name: string, base = "field") {
  return errors?.[name] ? `${base} err` : base;
}
