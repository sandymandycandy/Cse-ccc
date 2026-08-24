import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ResourceKind } from "@/lib/resources";

/** Admin-side resource reads (service role). Resources have no draft state — a
 *  row is public the moment it exists — so admin and public see the same set;
 *  the admin views add the owning club and management affordances. */

export interface AdminResourceRow {
  id: string;
  title: string;
  url: string;
  kind: ResourceKind;
  clubId: string | null;
  clubName: string | null;
  updatedAt: string;
}

export interface ResourceForEdit {
  id: string;
  title: string;
  url: string;
  kind: ResourceKind;
  clubId: string | null;
}

export async function listResourcesForAdmin(): Promise<AdminResourceRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("resources")
    .select("id, title, url, kind, club_id, updated_at, clubs(name)")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    url: r.url,
    kind: r.kind,
    clubId: r.club_id,
    clubName: r.clubs?.name ?? null,
    updatedAt: r.updated_at,
  }));
}

export async function getResourceForEdit(id: string): Promise<ResourceForEdit | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("resources")
    .select("id, title, url, kind, club_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, title: data.title, url: data.url, kind: data.kind, clubId: data.club_id };
}
