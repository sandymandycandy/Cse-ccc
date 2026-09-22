/**
 * The event's group-chat invite — who is offered it, and what counts as one.
 *
 * Pure, because both ends of the feature depend on the same rule: the
 * registration API decides here whether to hand the link back to the browser,
 * and the confirmation email decides here whether to put a button in the mail.
 * If the two ever disagreed, a student would be shown a group in one place and
 * not the other.
 *
 * A `chat.whatsapp.com` invite is a bearer token: anyone holding it can join.
 * That is why the link never reaches the public event page — only a registrant,
 * in the response to their own successful POST.
 */

/** Matches the `length(whatsapp_url) <= 300` check on `events`. */
const MAX_LEN = 300;

/**
 * Outcomes that mean the registration landed. All three are offered the group:
 * a shortlist applicant and a waitlisted entry are part of the event's
 * conversation even before anyone promises them a seat. `duplicate` is left
 * out — that registration landed on an earlier visit, which is when they were
 * given the link.
 */
const INVITED: ReadonlySet<string> = new Set(["registered", "submitted", "waitlisted"]);

/**
 * True when a value is a link we are willing to store, render and mail.
 *
 * https only, so an invite is never carried in the clear, and so no other
 * scheme — `javascript:` above all — can reach an `href` we render.
 */
export function isGroupLink(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const url = value.trim();
  if (!url || url.length > MAX_LEN) return false;
  if (/\s/.test(url)) return false;
  if (!/^https:\/\//i.test(url)) return false;
  return URL.canParse(url);
}

/** The group link to offer this registrant, or null if they get none. */
export function groupLinkFor(status: string, url: string | null | undefined): string | null {
  if (!INVITED.has(status)) return null;
  if (!isGroupLink(url)) return null;
  return url.trim();
}
