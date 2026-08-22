"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { writeAudit } from "@/lib/admin/audit";

/**
 * Manual attendance toggle — the walk-in / dead-phone fallback (§13.8). Marks or
 * clears `attended` with checkin_method='manual' and records the actor, audited.
 */
export async function toggleAttendanceAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) return;

  const registrationId = String(formData.get("registrationId") ?? "");
  const eventId = String(formData.get("eventId") ?? "");
  const attend = formData.get("attend") === "1";
  if (!registrationId || !eventId) return;

  const ev = await getEventForAttendance(eventId);
  if (!ev || !canManage(session, "manage:registrations", ev.clubId)) return;

  const admin = createAdminClient();
  await admin
    .from("registrations")
    .update({
      attended: attend,
      checked_in_at: attend ? new Date().toISOString() : null,
      checked_in_by: attend ? session.id : null,
      checkin_method: attend ? "manual" : null,
    })
    .eq("id", registrationId)
    .eq("event_id", eventId);

  await writeAudit({
    actorId: session.id,
    action: attend ? "attend_manual" : "attend_undo",
    entity: "registration",
    entityId: registrationId,
  });

  revalidatePath(`/admin/events/${eventId}/registrations`);
}
