import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapRosterRows, sortRoster, type RosterMember, type RosterRow } from "./roster";

// ONE string literal — splitting a .select() degrades the inferred row type to
// GenericStringError and every field access then fails to compile.
// `clubs(...)` is an embedded FK read, not a second query; it names only the
// three club fields the page renders, for the same reason the member fields are
// enumerated rather than selected with `*`.
// prettier-ignore
const PUBLIC_COLS =
  "id, full_name, roll_no, designation, linkedin_url, instagram_url, bio, photo_path, club_id, clubs(id, name, slug)";

const PHOTO_BUCKET = "council-photos";

/** photo_path -> public URL. The path is stored, never the URL: the project ref
 *  already changed once (Seoul -> Mumbai, 2026-09-05) and stored URLs would have
 *  broken every photo that day. */
function photoUrlFor(path: string): string | null {
  return (
    createAdminClient().storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl ?? null
  );
}

/**
 * The council roster as shown on the public `/team` page.
 *
 * Returns `null` when the read FAILED, and `[]` when it genuinely found nobody.
 * The caller must tell those apart: collapsing them renders "the roster is being
 * put together" over a transient Supabase blip, which is indistinguishable from
 * the truth and is how a broken page goes unnoticed. A real PGRST303
 * ("JWT issued at future") did exactly that on 2026-09-13.
 *
 * ⚠️ PII PROJECTION — read before editing the select.
 * `council_members` is RLS-on-with-no-policies (service role only) and carries
 * `email` and `phone` alongside the public fields. Those two columns are NOT
 * named below and must never be added: the rows returned here are serialised
 * straight into a server component's props and shipped to the browser, so
 * anything selected is public. This mirrors `teamMembersForPublic()` on the
 * results page.
 *
 * Three conditions gate publication, all required:
 *   is_public    — an explicit click in /admin/team. Defaults to FALSE.
 *   approved_at  — onboarded, so a pending self-registration cannot publish itself.
 *   is_active    — still on the roster.
 *
 * Row count is ~26 against a 1,000-row PostgREST cap, so no `.range()` paging.
 * Revisit if the council ever grows past a few hundred.
 */
export async function getCouncilRoster(): Promise<RosterMember[] | null> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("council_members")
    .select(PUBLIC_COLS)
    .eq("is_public", true)
    .eq("is_active", true)
    .not("approved_at", "is", null)
    .overrideTypes<RosterRow[]>();

  if (error) {
    // ⚠️ 42703 = undefined_column: migration 20260913000000_council_member_link.sql
    // has not been applied yet (apply it with the Supabase MCP `apply_migration`
    // tool — never `db push`, see docs/STATUS.md).
    //
    // FAIL CLOSED. An earlier cut fell back to a select without these columns,
    // which published all 26 members — precisely the people that
    // `is_public DEFAULT false` exists to protect. If visibility cannot be read,
    // nothing may be published. `[]` rather than null because "nobody is listed"
    // is the truthful state, and it renders the "being put together" copy.
    if (error.code === "42703") {
      console.warn(
        "getCouncilRoster: council_members is missing a column this read needs " +
          "(is_public/linkedin_url/instagram_url, or club_id) — apply migrations " +
          "20260913000000_council_member_link.sql and " +
          "20260914010000_council_member_club.sql. Publishing NOBODY until then.",
      );
      return [];
    }

    // Log the FIELDS, not the object. PostgrestError extends Error, whose
    // properties are non-enumerable, so `console.error(msg, error)` prints a bare
    // `{}` — which is precisely what hid a PGRST303 on 2026-09-13.
    console.error(
      `getCouncilRoster failed — code=${error.code} message=${error.message} ` +
        `details=${error.details} hint=${error.hint}`,
    );
    return null;
  }

  return sortRoster(mapRosterRows(data ?? [], photoUrlFor));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One published council member, for `/team/[id]`.
 *
 * ⚠️ Applies the SAME three gates as {@link getCouncilRoster} — is_public,
 * is_active, approved_at. A member who is hidden on the grid must also 404 on a
 * direct URL; gating only the list would make every hidden person reachable by
 * anyone who guessed or kept an old link, which defeats the Hide button entirely.
 *
 * Returns null for "no such published member" AND for a failed read. The caller
 * renders notFound() either way: there is nothing useful to show, and a 404 is
 * the safe answer when we cannot confirm someone is meant to be public.
 */
export async function getCouncilMember(id: string): Promise<RosterMember | null> {
  // Checked before the query: a malformed id makes Postgres raise 22P02 rather
  // than returning no rows, which would surface as a 500 instead of a 404.
  if (!UUID_RE.test(id)) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("council_members")
    .select(PUBLIC_COLS)
    .eq("id", id)
    .eq("is_public", true)
    .eq("is_active", true)
    .not("approved_at", "is", null)
    .maybeSingle()
    .overrideTypes<RosterRow>();

  if (error) {
    if (error.code === "42703") {
      console.warn(
        "getCouncilMember: council_members is missing a column this read needs " +
          "(is_public/linkedin_url/instagram_url, or club_id) — apply migrations " +
          "20260913000000_council_member_link.sql and " +
          "20260914010000_council_member_club.sql. Serving 404 until then.",
      );
      return null;
    }
    console.error(
      `getCouncilMember failed — code=${error.code} message=${error.message} ` +
        `details=${error.details} hint=${error.hint}`,
    );
    return null;
  }

  return data ? (mapRosterRows([data], photoUrlFor)[0] ?? null) : null;
}
