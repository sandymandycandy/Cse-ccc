"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { getEventFormSchema } from "@/lib/admin/registrations";
import { shortlistRecipients } from "@/lib/registration-form/recipients";
import { enqueueEmail } from "@/lib/email";
import { writeAudit } from "@/lib/admin/audit";

const uuid = z.string().uuid();

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

/**
 * Shortlist the selected submissions (shortlist-mode events) and email only the
 * newly-selected ones that have an email. Own-club scoped; audited. Re-running is
 * idempotent — already-shortlisted rows aren't re-emailed.
 */
export async function shortlistAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const eventId = String(formData.get("eventId") ?? "");
  if (!uuid.safeParse(eventId).success) redirect("/admin/events");
  const ev = await getEventForAttendance(eventId);
  if (!ev || !canManage(session, "manage:registrations", ev.clubId)) redirect("/admin/events");

  const ids = formData
    .getAll("selected")
    .map(String)
    .filter((v) => uuid.safeParse(v).success);
  if (ids.length === 0) redirect(`/admin/events/${eventId}/registrations`);

  const admin = createAdminClient();
  // Email only the newly-selected (currently not shortlisted) rows.
  const { data: rows } = await admin
    .from("registrations")
    .select("id, email, student_name, shortlisted_at, custom_answers")
    .eq("event_id", eventId)
    .in("id", ids);
  const now = new Date().toISOString();
  // Scope the write to this event as well as the ids — otherwise an own-club admin
  // could shortlist another event's (or club's) registrations by passing their ids.
  await admin
    .from("registrations")
    .update({ shortlisted_at: now })
    .eq("event_id", eventId)
    .in("id", ids);

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const { schema } = await getEventFormSchema(eventId);
  for (const r of rows ?? []) {
    if (r.shortlisted_at) continue; // already shortlisted → don't re-email
    const recipients = shortlistRecipients(
      schema,
      r.custom_answers as Record<string, unknown> | null,
      r.email,
    );
    for (const to of recipients) {
      await enqueueEmail({
        template: "registration_shortlisted",
        toEmail: to,
        toName: r.student_name ?? "",
        subject: `You're selected — ${ev.title}`,
        payload: { eventTitle: ev.title, url: base ? `${base}/events/${eventId}` : undefined },
        priority: 2,
      });
    }
  }
  await writeAudit({
    actorId: session.id,
    action: "shortlist",
    entity: "event",
    entityId: eventId,
    after: { shortlisted: ids.length },
  });
  redirect(`/admin/events/${eventId}/registrations?shortlisted=1`);
}

/** Clear a single row's shortlist state (own-club scoped; audited). */
export async function unshortlistAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const eventId = String(formData.get("eventId") ?? "");
  const regId = String(formData.get("registrationId") ?? "");
  if (!uuid.safeParse(eventId).success || !uuid.safeParse(regId).success) {
    redirect("/admin/events");
  }
  const ev = await getEventForAttendance(eventId);
  if (!ev || !canManage(session, "manage:registrations", ev.clubId)) redirect("/admin/events");
  const admin = createAdminClient();
  await admin
    .from("registrations")
    .update({ shortlisted_at: null })
    .eq("id", regId)
    .eq("event_id", eventId);
  await writeAudit({
    actorId: session.id,
    action: "unshortlist",
    entity: "event",
    entityId: eventId,
    after: { registrationId: regId },
  });
  redirect(`/admin/events/${eventId}/registrations`);
}
