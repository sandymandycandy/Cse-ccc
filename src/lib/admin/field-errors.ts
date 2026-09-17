/**
 * Zod issues → one message per field, for rendering under the input it is
 * about rather than as a single banner that names every field at once.
 *
 * Takes the bare shape rather than a `ZodError` so it is testable without
 * building one, and so it survives a Zod major version moving its helpers
 * around — only `path` and `message` are relied on.
 */
export function toFieldErrors(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    // The top-level field is what the input is bound to; a nested path still
    // belongs under that same control.
    const key = issue.path.length ? String(issue.path[0]) : "";
    // A pathless issue is about the form as a whole — it has no input to sit
    // under, so it is left for the caller to surface in the banner.
    if (!key) continue;
    // First complaint wins: a field failing two rules only needs the one the
    // person has to act on.
    if (out[key] === undefined) out[key] = issue.message;
  }
  return out;
}

/**
 * Split issues into per-field complaints and a fallback banner.
 *
 * ⚠️ A complaint about a field the form does not SHOW has nowhere to render,
 * and would vanish silently — leaving a form that refuses to submit and says
 * nothing about why. The auth forms validate hidden `token` and `secret`
 * fields, which is exactly that case: a tampered or expired hidden value must
 * surface as a banner, not as an invisible error on an invisible input.
 */
export function visibleFieldErrors(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
  visible: readonly string[],
  fallback: string,
): { fieldErrors?: Record<string, string>; error?: string } {
  const all = toFieldErrors(issues);
  const shown: Record<string, string> = {};
  let hidden = false;
  for (const [key, message] of Object.entries(all)) {
    if (visible.includes(key)) shown[key] = message;
    else hidden = true;
  }
  // A pathless issue has no field either, so it belongs in the banner too.
  if (issues.some((i) => i.path.length === 0)) hidden = true;
  if (Object.keys(shown).length === 0) return { error: fallback };
  return hidden ? { fieldErrors: shown, error: fallback } : { fieldErrors: shown };
}
