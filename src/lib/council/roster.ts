import { isSafeHttpUrl } from "@/lib/url";

/**
 * Pure helpers for the public council roster (`/team`).
 *
 * Deliberately free of server imports so both functions are unit-testable and
 * safe to call from a client component if the page ever needs one.
 */

/** One person as the public page sees them. Three fields, by design — the
 *  `council_members` row also carries `email` and `phone`, and neither is ever
 *  read into this shape. See `public-roster.ts`. */
export interface RosterMember {
  id: string;
  name: string;
  rollNo: string | null;
  /** Self-reported title, free text, e.g. "AppNova - Vice Head". */
  designation: string;
  /** Scheme-checked by the time they reach a component — see `mapRosterRows`. */
  linkedinUrl: string | null;
  instagramUrl: string | null;
  /** Hand-written description, PLAIN TEXT. Rendered with `white-space: pre-line`,
   *  never as Markdown or HTML. Null when nobody has written one. */
  bio: string | null;
  /** Resolved public Storage URL, or null when there is no photo (the card and
   *  profile then fall back to the initials monogram). */
  photoUrl: string | null;
}

/** Words for the monogram. Splits on whitespace AND dots, because the roster
 *  holds names like "D.BHANU TEJA" and "Rupa Sri.V" where a dot — not a space —
 *  is the real word boundary. Punctuation-only tokens are dropped. */
function wordsOf(name: string): string[] {
  return name
    .split(/[\s.]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length > 0);
}

/**
 * Up to two initials, standing in for a photo nobody has uploaded yet.
 *
 * First word + last word, so an eight-token name yields two letters rather than
 * a wall of them. Returns "?" rather than an empty string, so the circle is
 * never rendered blank.
 */
export function initialsOf(name: string): string {
  const words = wordsOf(name);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/**
 * A→Z by designation, then by name, then by id.
 *
 * Case-insensitive throughout: the roster holds both "Vice head" and "Vice Head
 * Cyber Sentinel Club", and a raw codepoint sort would file every capitalised
 * title above every lowercase one. The id is the final tiebreak so two people
 * with the same name and role can never swap places between renders.
 */
export function sortRoster<T extends RosterMember>(members: readonly T[]): T[] {
  const cmp = (a: string, b: string) =>
    a.localeCompare(b, "en", { sensitivity: "base", numeric: true });
  return [...members].sort(
    (a, b) =>
      cmp(a.designation, b.designation) || cmp(a.name, b.name) || cmp(a.id, b.id),
  );
}

/**
 * The six council offices, in BUILD_PLAN §3.1 order (the Faculty Advisor is
 * deliberately absent — owner's call, 2026-09-13). A member holding one of these
 * titles is rendered in a tier above the club heads.
 *
 * These are matched EXACTLY (case- and whitespace-insensitively, nothing more).
 * Substring matching was rejected on purpose: a real row reads "Vice head" with
 * no club named, and "Vice Head Cyber Sentinel Club" is a club officer — either
 * would be wrongly promoted by a looser rule. To move someone into this tier,
 * edit their designation in /admin/council/members to match one of these.
 */
export const LEADERSHIP_TITLES = [
  "President",
  "Vice President",
  "Technical Head",
  "Events Head",
  "Documentation Head",
  "Social Media Head",
] as const;

const RANK_BY_TITLE = new Map(
  LEADERSHIP_TITLES.map((title, i) => [title.toLowerCase(), i] as const),
);

/** 0-based position in {@link LEADERSHIP_TITLES}, or null for everyone else. */
export function leadershipRankOf(designation: string): number | null {
  return RANK_BY_TITLE.get(designation.trim().toLowerCase()) ?? null;
}

/**
 * Split the roster into the leadership tier (rank order) and everyone else
 * (A→Z by role, via {@link sortRoster}).
 *
 * Two people sharing one office are ordered by name, so a handover period with
 * two Presidents listed does not render in arbitrary order.
 */
export function splitRoster<T extends RosterMember>(
  members: readonly T[],
): { leadership: T[]; heads: T[] } {
  const leadership: T[] = [];
  const heads: T[] = [];
  for (const m of members) {
    (leadershipRankOf(m.designation) === null ? heads : leadership).push(m);
  }
  leadership.sort(
    (a, b) =>
      leadershipRankOf(a.designation)! - leadershipRankOf(b.designation)! ||
      a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
  );
  return { leadership, heads: sortRoster(heads) };
}

/** A `council_members` row as the public read selects it. The social columns are
 *  optional so a row shape from before migration 20260913000000 still typechecks. */
export interface RosterRow {
  id: string;
  full_name: string;
  roll_no: string | null;
  designation: string;
  linkedin_url?: string | null;
  instagram_url?: string | null;
  bio?: string | null;
  /** Object name in the `council-photos` bucket — never a URL. */
  photo_path?: string | null;
}

/**
 * DB rows → public members, with every personal link scheme-checked.
 *
 * The check is deliberately duplicated here even though the admin form already
 * rejects a bad URL on write: rows can also be inserted by hand in the SQL
 * editor, and this is the last gate before the value becomes an `href`. A
 * rejected link is dropped to null, never rendered as inert text.
 */
export function mapRosterRows(
  rows: readonly RosterRow[],
  /** Turns a `photo_path` into a public URL. Injected rather than imported so this
   *  stays pure and testable — only the server layer knows about Storage. */
  photoUrlFor?: (path: string) => string | null,
): RosterMember[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.full_name,
    rollNo: r.roll_no,
    designation: r.designation,
    linkedinUrl: safeUrlOrNull(r.linkedin_url),
    instagramUrl: safeUrlOrNull(r.instagram_url),
    bio: r.bio && r.bio.trim() !== "" ? r.bio.trim() : null,
    photoUrl: r.photo_path && photoUrlFor ? photoUrlFor(r.photo_path) : null,
  }));
}

function safeUrlOrNull(value: string | null | undefined): string | null {
  return value && isSafeHttpUrl(value) ? value.trim() : null;
}

/** One social link as the card renders it. */
export interface RosterSocial {
  label: string;
  url: string;
}

/**
 * The social links to show under a member, in a fixed order so the row reads the
 * same on every card. Empty when the member has none, which is how the card knows
 * to omit the row entirely.
 */
export function socialsOf(member: RosterMember): RosterSocial[] {
  const out: RosterSocial[] = [];
  if (member.linkedinUrl) out.push({ label: "LinkedIn", url: member.linkedinUrl });
  if (member.instagramUrl) out.push({ label: "Instagram", url: member.instagramUrl });
  return out;
}
