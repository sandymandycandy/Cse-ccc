import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Admin-side gallery reads (service role). Like resources, gallery photos have
 *  no draft state — a row is public the moment it's saved. */

export interface AdminGalleryRow {
  id: string;
  imagePath: string;
  imageUrl: string;
  caption: string | null;
  clubId: string | null;
  clubName: string | null;
  sort: number;
  createdAt: string;
}

export interface GalleryForEdit {
  id: string;
  imagePath: string;
  imageUrl: string;
  caption: string | null;
  clubId: string | null;
  sort: number;
}

function publicUrl(path: string): string {
  return createAdminClient().storage.from("gallery").getPublicUrl(path).data.publicUrl;
}

export async function listGalleryForAdmin(): Promise<AdminGalleryRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gallery")
    .select("id, image_path, caption, club_id, sort, created_at, clubs(name)")
    .order("sort", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((g) => ({
    id: g.id,
    imagePath: g.image_path,
    imageUrl: admin.storage.from("gallery").getPublicUrl(g.image_path).data.publicUrl,
    caption: g.caption,
    clubId: g.club_id,
    clubName: g.clubs?.name ?? null,
    sort: g.sort,
    createdAt: g.created_at,
  }));
}

export async function getGalleryForEdit(id: string): Promise<GalleryForEdit | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gallery")
    .select("id, image_path, caption, club_id, sort")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    imagePath: data.image_path,
    imageUrl: publicUrl(data.image_path),
    caption: data.caption,
    clubId: data.club_id,
    sort: data.sort,
  };
}
