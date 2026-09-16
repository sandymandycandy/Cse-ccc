import type { Database } from "@/lib/database.types";

type AdminRole = Database["public"]["Enums"]["admin_role"];
type MemberRole = Database["public"]["Enums"]["member_role"];

/**
 * How a role reads to a person, rather than to Postgres.
 *
 * Typed as a total map of `admin_role`, so adding a role to the enum without
 * naming it here is a typecheck failure rather than a `social_media_head`
 * appearing in somebody's recipient list.
 */
export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = {
  faculty_advisor: "Faculty Advisor",
  president: "President",
  vice_president: "Vice-President",
  tech_head: "Technical Head",
  events_head: "Events Head",
  docs_head: "Documentation Head",
  social_media_head: "Social Media Head",
  club_head: "Club Head",
  vice_head: "Vice Head",
  gallery_manager: "Gallery Manager",
};

export const MEMBER_ROLE_LABEL: Record<MemberRole, string> = {
  head: "Head",
  vice_head: "Vice Head",
  member: "Member",
};

/**
 * The one line under a name in the recipient picker: what they are, and where.
 *
 * Either half may be missing — an office-bearer belongs to no club, a council
 * row may have a blank designation — so this returns null rather than a
 * stranded separator.
 */
export function describeRecipient(
  role: string | null | undefined,
  club: string | null | undefined,
): string | null {
  const parts = [role, club].map((p) => (p ?? "").trim()).filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
