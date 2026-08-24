/**
 * Link-safety helpers (Phase 2 — content verticals).
 *
 * Anywhere a user-supplied URL becomes an `<a href>` (resources, and later
 * gallery/achievements links) it must be scheme-checked first: a `javascript:`
 * or `data:` href is a stored-XSS vector. This is the single source of truth for
 * "is this href safe to render", shared by the resources feature and the safe
 * Markdown renderer (`markdown.tsx`).
 */

/** URL schemes we will render as a clickable link. */
const SAFE_INLINE_SCHEME = /^(https?:\/\/|mailto:)/i;

/**
 * True when `href` is a link scheme we allow inside rich text: http(s) or
 * mailto. Everything else (javascript:, data:, vbscript:, relative, …) is
 * rejected so the caller can render it as inert text instead.
 */
export function isSafeLinkHref(href: string): boolean {
  return SAFE_INLINE_SCHEME.test(href.trim());
}

/**
 * True when `value` is a well-formed absolute http/https URL. Stricter than
 * {@link isSafeLinkHref} (no mailto, must parse as a real URL) — used for
 * resource links, which are always web destinations (Drive folders, docs).
 */
export function isSafeHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}
