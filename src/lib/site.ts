/**
 * Links into the main CCC website from the team page.
 *
 * The team page was built as a standalone preview, where these had to be
 * absolute URLs onto cse-ccc.vercel.app. It now lives inside that site, so a
 * link is just its own path. Kept as a function rather than inlined so the
 * team components read the same as they did in the preview.
 */
export function siteHref(path: string) {
  return path;
}
