"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth/guards";
import { canView } from "@/lib/auth/capabilities";
import { writeAudit } from "@/lib/admin/audit";

/**
 * Open / close the feedback window BY HAND (design D4 — there is no cron and no
 * auto-close). `canView` is the right check here, not `canManage`: the grant is
 * council-wide "all" for the three roles that hold it, and club scope is
 * meaningless for a single global window.
 */

async function requireFeedbackAdmin() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!canView(session, "view:feedback")) redirect("/admin");
  return session;
}

export async function openFeedbackAction(): Promise<void> {
  const session = await requireFeedbackAdmin();
  const admin = createAdminClient();

  // The partial unique index makes a second open row impossible, so a double
  // submit fails here rather than silently creating two windows.
  const { data, error } = await admin
    .from("feedback_periods")
    .insert({ opened_by: session.id })
    .select("id")
    .single();

  if (!error && data) {
    await writeAudit({
      actorId: session.id,
      action: "open",
      entity: "feedback_period",
      entityId: data.id,
    });
  } else if (error) {
    console.error("feedback open failed", error.message);
  }

  revalidatePath("/", "layout"); // the nav link + home banner appear site-wide
  redirect("/admin/feedback");
}

export async function closeFeedbackAction(): Promise<void> {
  const session = await requireFeedbackAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("feedback_periods")
    .update({ closed_at: new Date().toISOString(), closed_by: session.id })
    .is("closed_at", null)
    .select("id")
    .maybeSingle();

  if (!error && data) {
    await writeAudit({
      actorId: session.id,
      action: "close",
      entity: "feedback_period",
      entityId: data.id,
    });
  } else if (error) {
    console.error("feedback close failed", error.message);
  }

  revalidatePath("/", "layout");
  redirect("/admin/feedback");
}
