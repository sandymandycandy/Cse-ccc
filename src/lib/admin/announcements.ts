import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Admin-side announcement reads (service role — drafts included). */

export interface AdminAnnouncementRow {
  id: string;
  slug: string;
  title: string;
  publishedAt: string | null;
  updatedAt: string;
}

export interface AnnouncementForEdit {
  id: string;
  slug: string;
  title: string;
  bodyMarkdown: string;
  publishedAt: string | null;
  imagePath: string | null;
}

export async function listAnnouncementsForAdmin(): Promise<AdminAnnouncementRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("announcements")
    .select("id, slug, title, published_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((a) => ({
    id: a.id,
    slug: a.slug,
    title: a.title,
    publishedAt: a.published_at,
    updatedAt: a.updated_at,
  }));
}

export async function getAnnouncementForEdit(id: string): Promise<AnnouncementForEdit | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("announcements")
    .select("id, slug, title, body_markdown, published_at, image_path")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    slug: data.slug,
    title: data.title,
    bodyMarkdown: data.body_markdown,
    publishedAt: data.published_at,
    imagePath: data.image_path,
  };
}

/** URL-safe slug from a title. */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "announcement"
  );
}

/** A slug not already used by another row (appends a short suffix on collision). */
export async function uniqueSlug(title: string, excludeId?: string): Promise<string> {
  const admin = createAdminClient();
  const base = slugify(title);
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data } = await admin
      .from("announcements")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data || data.id === excludeId) return candidate;
  }
  // Fall back to a guaranteed-unique suffix.
  return `${base}-${Date.now().toString(36)}`;
}
