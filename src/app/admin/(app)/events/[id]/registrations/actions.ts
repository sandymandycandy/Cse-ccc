"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth/guards";
import { canManageEvent } from "@/lib/admin/event-hosts";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { getEventFormSchema } from "@/lib/admin/registrations";
import { isAttendanceEligible } from "@/lib/admin/attendance-eligibility";
import { teamRecipients } from "@/lib/registration-form/recipients";
import { enqueueEmail } from "@/lib/email";
import { writeAudit } from "@/lib/admin/audit";
import { teamOf } from "@/lib/certificates/fields";
import { setPerson } from "@/lib/admin/team-attendance";
import { getRegistrationForMarking, writeRegistrationAttendance } from "@/lib/admin/registration-attendance";

const uuid = z.string().uuid();

/**
 * Manual attendance toggle — the walk-in / dead-phone fallback (§13.8). Marks or
 * clears the whole team (`attended`) with checkin_method='manual' and records the
 * actor, audited. Either way every per-person absence is cleared.
 */
export async function toggleAttendanceAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) return;

  const registrationId = String(formData.get("registrationId") ?? "");
  const eventId = String(formData.get("eventId") ?? "");
  const attend = formData.get("attend") === "1";
  if (!registrationId || !eventId) return;

  const ev = await getEventForAttendance(eventId);
  if (!ev || !canManageEvent(session, "manage:registrations", ev.hosts)) return;

  const admin = createAdminClient();
  const { selectionMode } = await getEventFormSchema(eventId);

  // Marking present is scoped: a shortlist event admits only shortlisted rows.
  // An undo (clearing `attended`) is always allowed so an unshortlisted-after-
  // marking row can still be corrected.
  if (attend) {
    const { data: reg } = await admin
      .from("registrations")
      .select("shortlisted_at")
      .eq("id", registrationId)
      .eq("event_id", eventId)
      .maybeSingle();
    if (!reg) return;
    if (!isAttendanceEligible({ shortlistedAt: reg.shortlisted_at }, selectionMode)) {
      return; // shortlist event, not shortlisted → not markable
    }
  }

  let write = admin
    .from("registrations")
    .update({
      attended: attend,
      absent_members: [],
      checked_in_at: attend ? new Date().toISOString() : null,
      checked_in_by: attend ? session.id : null,
      checkin_method: attend ? "manual" : null,
    })
    .eq("id", registrationId)
    .eq("event_id", eventId);
  // Re-checked in the write: another admin may have moved the team off the
  // shortlist since the read above.
  if (attend && selectionMode === "shortlist") write = write.not("shortlisted_at", "is", null);
  const { data: written, error } = await write.select("id");
  if (error) throw error;
  if (!written?.length) return; // gone, or no longer shortlisted

  await writeAudit({
    actorId: session.id,
    action: attend ? "attend_manual" : "attend_undo",
    entity: "registration",
    entityId: registrationId,
  });

  revalidatePath(`/admin/events/${eventId}/registrations`);
}

/**
 * Promote one waitlisted registration to confirmed (own-club scoped; audited).
 * Sets confirmed_at + clears the position; allowed past capacity (a deliberate
 * organiser override). Emails the student if they gave an email.
 */
export async function promoteWaitlistAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) return;

  const registrationId = String(formData.get("registrationId") ?? "");
  const eventId = String(formData.get("eventId") ?? "");
  if (!uuid.safeParse(registrationId).success || !uuid.safeParse(eventId).success) return;

  const ev = await getEventForAttendance(eventId);
  if (!ev || !canManageEvent(session, "manage:registrations", ev.hosts)) return;

  const admin = createAdminClient();
  const { data: reg } = await admin
    .from("registrations")
    .select("id, email, student_name, confirmed_at, custom_answers")
    .eq("id", registrationId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!reg || reg.confirmed_at) return; // gone, or already confirmed

  await admin
    .from("registrations")
    .update({ confirmed_at: new Date().toISOString(), waitlist_position: null })
    .eq("id", registrationId)
    .eq("event_id", eventId);

  // The whole team moves off the waitlist together, so the whole team is told.
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const { schema: promoteSchema } = await getEventFormSchema(eventId);
  for (const to of teamRecipients(
    promoteSchema,
    reg.custom_answers as Record<string, unknown> | null,
    reg.email,
  )) {
    await enqueueEmail({
      template: "registration_promoted",
      toEmail: to,
      toName: to === reg.email?.toLowerCase() ? (reg.student_name ?? "") : "",
      subject: `A seat opened up — ${ev.title}`,
      payload: { eventTitle: ev.title, url: base ? `${base}/events/${eventId}` : undefined },
      priority: 2,
    });
  }

  await writeAudit({
    actorId: session.id,
    action: "waitlist_promote",
    entity: "registration",
    entityId: registrationId,
  });
  revalidatePath(`/admin/events/${eventId}/registrations`);
}

export type MemberAttendanceResult =
  | { ok: true; attended: boolean; absent: number[] }
  | { ok: false; error: string };

/**
 * One person on a team, present or absent (spec 2026-09-23). Present is the
 * default, so this records exceptions; the rules live in team-attendance.ts.
 */
export async function setMemberAttendanceAction(input: {
  eventId: string;
  registrationId: string;
  position: number;
  present: boolean;
}): Promise<MemberAttendanceResult> {
  const denied = { ok: false as const, error: "You can't mark attendance for this entry." };
  const session = await getAdminSession();
  if (!session) return denied;
  if (!uuid.safeParse(input.eventId).success || !uuid.safeParse(input.registrationId).success) return denied;

  const ev = await getEventForAttendance(input.eventId);
  if (!ev || !canManageEvent(session, "manage:registrations", ev.hosts)) return denied;

  const [{ schema, selectionMode }, reg] = await Promise.all([
    getEventFormSchema(input.eventId),
    getRegistrationForMarking(input.eventId, input.registrationId),
  ]);
  if (!reg || !isAttendanceEligible(reg, selectionMode)) return denied;

  const team = teamOf(reg, schema);
  const people = team.length > 0 ? team.map((p) => p.name || p.roll) : [reg.name];
  const next = setPerson(people.length, { attended: reg.attended, absent: reg.absent }, input.position, input.present);
  if (!next) return { ok: false, error: "Could not save — refresh and try again." };

  // Solo entries never carry per-person absences.
  const absent = team.length > 0 ? next.absent : [];
  const written = await writeRegistrationAttendance({
    eventId: input.eventId,
    registrationId: input.registrationId,
    attended: next.attended,
    absent,
    actorId: session.id,
    stampCheckIn: next.attended !== reg.attended,
    onlyShortlisted: selectionMode === "shortlist",
  });
  if (!written) return denied;
  await writeAudit({
    actorId: session.id,
    action: "attend_member",
    entity: "registration",
    entityId: input.registrationId,
    after: { position: input.position, name: people[input.position], present: input.present },
  });
  revalidatePath(`/admin/events/${input.eventId}/registrations`);
  return { ok: true, attended: next.attended, absent };
}
