import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { splitRoster } from "@/lib/council/roster";

/** One row of the /admin/team editor. Carries the admin-only fields the public
 *  roster deliberately never selects — nothing here reaches a public page. */
export interface TeamAdminRow {
  id: string;
  name: string;
  rollNo: string | null;
  designation: string;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  bio: string | null;
  /** Stored object name, needed to delete the old file when a photo is replaced. */
  photoPath: string | null;
  /** Resolved public URL, for the thumbnail in the editor. */
  photoUrl: string | null;
  isPublic: boolean;
  /** From `is_active` on the roster — "counts toward attendance". Shown because a
   *  member who is inactive will not appear on /team even when set public, and
   *  that would otherwise look like a broken toggle. */
  isActive: boolean;
}

// One string literal on purpose: supabase-js infers the row type from the select
// literal, and a concatenation degrades it to GenericStringError.
// prettier-ignore
const COLS = "id, full_name, roll_no, designation, linkedin_url, instagram_url, bio, photo_path, is_public, is_active";

export const COUNCIL_PHOTO_BUCKET = "council-photos";

/** True when the roster has not had migration 20260913000000 applied yet. */
export class TeamColumnsMissingError extends Error {
  constructor() {
    super(
      "council_members is missing is_public/linkedin_url/instagram_url — apply " +
        "migration 20260913000000_council_member_link.sql via the Supabase MCP " +
        "`apply_migration` tool (never `db push`, see docs/STATUS.md).",
    );
    this.name = "TeamColumnsMissingError";
  }
}

/**
 * Every onboarded council member, in the same order `/team` renders them —
 * leadership tier first, then A→Z by role — so what you reorder in your head on
 * the public page matches what you see here.
 *
 * Pending self-registrations are excluded: they are onboarded on
 * /admin/council/members, and publishing is a separate later decision.
 */
export async function listTeamMembers(): Promise<TeamAdminRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("council_members")
    .select(COLS)
    .not("approved_at", "is", null);

  // Surfaced, not swallowed: the page renders an explicit "apply the migration"
  // panel. Returning [] here would read as "no council members", which is a lie.
  if (error?.code === "42703") throw new TeamColumnsMissingError();
  if (error) throw error;

  const rows = (data ?? []).map((m) => ({
    id: m.id,
    name: m.full_name,
    rollNo: m.roll_no,
    designation: m.designation,
    linkedinUrl: m.linkedin_url,
    instagramUrl: m.instagram_url,
    bio: m.bio,
    photoPath: m.photo_path,
    photoUrl: m.photo_path
      ? (admin.storage.from(COUNCIL_PHOTO_BUCKET).getPublicUrl(m.photo_path).data.publicUrl ??
        null)
      : null,
    isPublic: m.is_public,
    isActive: m.is_active,
  }));

  // TeamAdminRow is a superset of RosterMember, so the public ordering applies
  // directly: leadership tier first, then A→Z by role. Both surfaces agree.
  const { leadership, heads } = splitRoster(rows);
  return [...leadership, ...heads];
}

/** One member, for the actions that need their current photo before replacing it. */
export async function getTeamMember(id: string): Promise<TeamAdminRow | null> {
  const all = await listTeamMembers();
  return all.find((m) => m.id === id) ?? null;
}
