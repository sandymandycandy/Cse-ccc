"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/admin/audit";
import { canToggleMaintenance } from "@/lib/admin/site-status";

const OnValue = z.enum(["true", "false"]);

/**
 * Flip the public site's maintenance switch (spec 2026-09-24). The role check
 * lives HERE — hiding the dashboard card is only UX. The proxy picks the new
 * value up within its 10 s cache.
 */
export async function setMaintenanceAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!canToggleMaintenance(session.role)) redirect("/admin");

  const parsed = OnValue.safeParse(formData.get("on"));
  if (!parsed.success) redirect("/admin");
  const on = parsed.data === "true";

  const admin = createAdminClient();
  const { data: before } = await admin
    .from("site_settings")
    .select("maintenance")
    .eq("id", true)
    .maybeSingle();

  const { error } = await admin
    .from("site_settings")
    .update({ maintenance: on, updated_by: session.id, updated_at: new Date().toISOString() })
    .eq("id", true);

  if (error) {
    console.error("maintenance switch update failed:", error.message);
    redirect("/admin?maintenance=error");
  }

  await writeAudit({
    actorId: session.id,
    action: on ? "maintenance_on" : "maintenance_off",
    entity: "site_settings",
    before: before ? { maintenance: before.maintenance } : null,
    after: { maintenance: on },
  });

  revalidatePath("/admin", "layout"); // the card and the banner
  redirect("/admin");
}
