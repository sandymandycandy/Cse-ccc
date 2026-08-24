import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Admin-side achievement reads (service role). Like the other content
 *  verticals, achievements have no draft state — a row is public once saved. */

export interface AdminAchievementRow {
  id: string;
  title: string;
  happenedOn: string | null;
  clubId: string | null;
  clubName: string | null;
  hasImage: boolean;
  createdAt: string;
}

export interface AchievementForEdit {
  id: string;
  title: string;
  description: string;
  happenedOn: string | null;
  clubId: string | null;
  imagePath: string | null;
  imageUrl: string | null;
}

function publicUrl(path: string): string {
  return createAdminClient().storage.from("achievements").getPublicUrl(path).data.publicUrl;
}

export async function listAchievementsForAdmin(): Promise<AdminAchievementRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("achievements")
    .select("id, title, happened_on, club_id, image_path, created_at, clubs(name)")
    .order("happened_on", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    happenedOn: a.happened_on,
    clubId: a.club_id,
    clubName: a.clubs?.name ?? null,
    hasImage: a.image_path != null,
    createdAt: a.created_at,
  }));
}

export async function getAchievementForEdit(id: string): Promise<AchievementForEdit | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("achievements")
    .select("id, title, description, happened_on, club_id, image_path")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    title: data.title,
    description: data.description ?? "",
    happenedOn: data.happened_on,
    clubId: data.club_id,
    imagePath: data.image_path,
    imageUrl: data.image_path ? publicUrl(data.image_path) : null,
  };
}
