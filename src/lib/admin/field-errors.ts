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
