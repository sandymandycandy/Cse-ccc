"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth/guards";
import { canManageEvent } from "@/lib/admin/event-hosts";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { getEventFormSchema } from "@/lib/admin/registrations";
import { teamRecipients } from "@/lib/registration-form/recipients";
import { enqueueEmail, enqueueEmailBatch, type EnqueueEmailArgs } from "@/lib/email";
import { BULK_PRIORITY } from "@/lib/email/bulk";
import { shouldQueue } from "@/lib/admin/broadcast-audience";
import { writeAudit } from "@/lib/admin/audit";
import { decisionPatch } from "@/lib/registration/shortlist";

const uuid = z.string().uuid();
const decisionInput = z.object({
  eventId: uuid,
  registrationId: uuid,
  decision: z.enum(["shortlist", "waitlist"]).nullable(),
});
const DENIED = { ok: false as const, error: "You can't change the shortlist for this event." };
const SAVE_FAILED = { ok: false as const, error: "Could not save — refresh and try again." };

/** Own-club (or co-host) manager of a shortlist-mode event, or null. */
async function authorise(eventId: string) {
  const session = await getAdminSession();
  if (!session) return null;
  const ev = await getEventForAttendance(eventId);
  if (!ev || !canManageEvent(session, "manage:registrations", ev.hosts)) return null;
  const { schema, selectionMode } = await getEventFormSchema(eventId);
  if (selectionMode !== "shortlist") return null;
  return { session, ev, schema };
}

function revalidate(eventId: string) {
  for (const p of ["shortlist", "registrations", "participants"]) {
    revalidatePath(`/admin/events/${eventId}/${p}`);
  }
}

/** Put one registration in a category. Silent: never emails. */
export async function setShortlistDecisionAction(input: {
  eventId: string;
  registrationId: string;
  decision: "shortlist" | "waitlist" | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = decisionInput.safeParse(input);
  if (!parsed.success) return DENIED;
  const { eventId, registrationId, decision } = parsed.data;
  const auth = await authorise(eventId);
  if (!auth) return DENIED;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("registrations")
    .update(decisionPatch(decision))
    .eq("id", registrationId)
    .eq("event_id", eventId)
    .select("id");
  if (error || !data?.length) return SAVE_FAILED;

  await writeAudit({
    actorId: auth.session.id,
    action: "shortlist_decision",
    entity: "registration",
    entityId: registrationId,
    after: { decision },
  });
  revalidate(eventId);
  return { ok: true };
}

/**
 * Email every shortlisted-but-not-yet-emailed team and admit them to attendance.
 * One conditional update both stamps and claims the rows: only rows it returns
 * are emailed, so a double click or two admins at once cannot email a team twice.
 */
export async function finaliseShortlistAction(input: {
  eventId: string;
}): Promise<{ ok: true; teams: number; recipients: number; queued: boolean } | { ok: false; error: string }> {
  if (!uuid.safeParse(input.eventId).success) return DENIED;
  const eventId = input.eventId;
  const auth = await authorise(eventId);
  if (!auth) return DENIED;

  const admin = createAdminClient();
  const { data: claimed, error } = await admin
    .from("registrations")
    .update({ shortlisted_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .eq("shortlist_decision", "shortlist")
    .is("shortlisted_at", null)
    .select("id, email, student_name, custom_answers");
  if (error) return SAVE_FAILED;
  const rows = claimed ?? [];

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const payload = { eventTitle: auth.ev.title, url: base ? `${base}/events/${eventId}` : undefined };
  const teams = rows.map((r) => ({
    id: r.id,
    mails: teamRecipients(auth.schema, r.custom_answers as Record<string, unknown> | null, r.email).map(
      (to): EnqueueEmailArgs => ({
        template: "registration_shortlisted",
        toEmail: to,
        toName: to === r.email?.trim().toLowerCase() ? (r.student_name ?? "") : "",
        subject: `You're selected — ${auth.ev.title}`,
        payload,
        priority: 2,
      }),
    ),
  }));
  const mails = teams.flatMap((t) => t.mails);

  // Past INLINE_MAX, sequential SMTP sends would outrun the function limit —
  // queue them for the Outbox instead, as the broadcast page does. Sent team
  // by team so a failure can hand back exactly the teams that got nothing:
  // they were claimed above, and a claimed team is never picked up again.
  const queued = shouldQueue(mails.length);
  const sent = new Set<string>();
  try {
    for (const t of teams) {
      if (queued) await enqueueEmailBatch(t.mails.map((m) => ({ ...m, priority: BULK_PRIORITY })));
      else for (const m of t.mails) await enqueueEmail(m);
      sent.add(t.id);
    }
  } catch {
    const unsent = teams.filter((t) => !sent.has(t.id)).map((t) => t.id);
    await admin.from("registrations").update({ shortlisted_at: null }).eq("event_id", eventId).in("id", unsent);
    revalidate(eventId);
    return {
      ok: false,
      error: `Emailed ${sent.size} of ${teams.length} teams, then sending failed. Press Finalise again to send the rest.`,
    };
  }

  await writeAudit({
    actorId: auth.session.id,
    action: "shortlist_finalise",
    entity: "event",
    entityId: eventId,
    after: { teams: rows.length, recipients: mails.length, queued },
  });
  revalidate(eventId);
  return { ok: true, teams: rows.length, recipients: mails.length, queued };
}
