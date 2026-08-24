import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Clubs for an admin form's club picker (id + name, alphabetical). Shared by
 *  the content verticals that can file rows under a club (resources, gallery). */
export async function listClubsBrief(): Promise<{ id: string; name: string }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("clubs").select("id, name").order("name");
  if (error) throw error;
  return data ?? [];
}
