import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";

type ClubCategory = Database["public"]["Enums"]["club_category"];

/** Clubs for an admin form's club picker (id + name, alphabetical). Shared by
 *  the content verticals that can file rows under a club (resources, gallery). */
export async function listClubsBrief(): Promise<{ id: string; name: string }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("clubs").select("id, name").order("name");
  if (error) throw error;
  return data ?? [];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve a self-registration link token to its club. Service-role only.
 *  `join_token` is a uuid column, so a non-uuid token can never match — short-circuit
 *  to null rather than let Postgres reject the malformed literal (a garbage token in
 *  the URL then 404s cleanly instead of 500-ing). */
export async function getClubByJoinToken(
  token: string,
): Promise<{ id: string; name: string; tagline: string | null; color: string } | null> {
  if (!UUID_RE.test(token)) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clubs")
    .select("id, name, tagline, color")
    .eq("join_token", token)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** A club's public profile as the editor sees it. Only the self-editable text
 *  fields — structural columns (slug, category, colour, is_active) aren't here. */
export interface AdminClubRow {
  id: string;
  name: string;
  shortName: string;
  category: ClubCategory;
  tagline: string | null;
  isActive: boolean;
  updatedAt: string;
}

export interface ClubForEdit {
  id: string;
  name: string;
  shortName: string;
  slug: string;
  category: ClubCategory;
  color: string;
  tagline: string | null;
  description: string | null;
  isActive: boolean;
  sort: number;
}

/** Every club, for the editor's list (ordered like the public directory). */
export async function listClubsForAdmin(): Promise<AdminClubRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clubs")
    .select("id, name, short_name, category, tagline, is_active, updated_at")
    .order("sort")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    shortName: c.short_name,
    category: c.category,
    tagline: c.tagline,
    isActive: c.is_active,
    updatedAt: c.updated_at,
  }));
}

export async function getClubForEdit(id: string): Promise<ClubForEdit | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clubs")
    .select("id, name, short_name, slug, category, color, tagline, description, is_active, sort")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    shortName: data.short_name,
    slug: data.slug,
    category: data.category,
    color: data.color,
    tagline: data.tagline,
    description: data.description,
    isActive: data.is_active,
    sort: data.sort,
  };
}
