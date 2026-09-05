"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
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

/**
 * Set which head / vice head the public form names for a club.
 *
 * Lives HERE and not on the club editor on purpose: club heads hold
 * manage:clubs with grant "own", so a picker on /admin/clubs/[id]/edit would
 * let a head point the form away from their own vice head, or at nobody.
 */
export async function setClubLeadersAction(formData: FormData): Promise<void> {
  const session = await requireFeedbackAdmin();

  const clubId = String(formData.get("clubId") ?? "");
  if (!z.string().uuid().safeParse(clubId).success) redirect("/admin/feedback");

  const asId = (v: FormDataEntryValue | null) => {
    const s = String(v ?? "");
    return z.string().uuid().safeParse(s).success ? s : null;
  };
  const headId = asId(formData.get("headId"));
  const viceHeadId = asId(formData.get("viceHeadId"));

  // A hand-typed name, for a leader who holds no admin account. Trimmed and
  // capped to match the column's check constraint. Picking an account CLEARS
  // the typed name for that role: the account wins in `resolveLeaders`, so
  // keeping the text would leave a name on screen that the form never uses.
  const asName = (v: FormDataEntryValue | null) => {
    const s = String(v ?? "").trim().slice(0, 80);
    return s.length > 0 ? s : null;
  };
  const headName = headId ? null : asName(formData.get("headName"));
  const viceHeadName = viceHeadId ? null : asName(formData.get("viceHeadName"));

  const admin = createAdminClient();
  const { error } = await admin
    .from("clubs")
    .update({
      feedback_head_id: headId,
      feedback_vice_head_id: viceHeadId,
      feedback_head_name: headName,
      feedback_vice_head_name: viceHeadName,
    })
    .eq("id", clubId);

  if (!error) {
    await writeAudit({
      actorId: session.id,
      action: "set_feedback_leaders",
      entity: "club",
      entityId: clubId,
      after: { headId, viceHeadId, headName, viceHeadName },
    });
  } else {
    console.error("feedback leader pick failed", error.message);
  }

  redirect("/admin/feedback");
}
