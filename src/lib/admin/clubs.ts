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

/** A club's public profile as the editor sees it. Only the self-editable text
 *  fields — structural columns (slug, category, colour, is_active) aren't here. */
export interface AdminClubRow {
  id: string;
  name: string;
  shortName: string;
  category: ClubCategory;
  tagline: string | null;
  updatedAt: string;
}

export interface ClubForEdit {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
}

/** Every club, for the editor's list (ordered like the public directory). */
export async function listClubsForAdmin(): Promise<AdminClubRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clubs")
    .select("id, name, short_name, category, tagline, updated_at")
    .order("sort")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    shortName: c.short_name,
    category: c.category,
    tagline: c.tagline,
    updatedAt: c.updated_at,
  }));
}

export async function getClubForEdit(id: string): Promise<ClubForEdit | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clubs")
    .select("id, name, tagline, description")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, name: data.name, tagline: data.tagline, description: data.description };
}
