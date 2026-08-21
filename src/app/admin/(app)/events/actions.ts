"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { enqueueEmail } from "@/lib/email";
import { writeAudit } from "@/lib/admin/audit";
import { istDateKey } from "@/lib/datetime";
import type { AdminRole } from "@/lib/auth/capabilities";
import type { EventFormState } from "@/lib/admin/form-state";

// Roles whose own events skip the approval queue (§9).
const AUTO_APPROVE: AdminRole[] = [
  "tech_head",
  "president",
  "vice_president",
  "events_head",
];

const CreateSchema = z
  .object({
    title: z.string().trim().min(3).max(140),
    description: z.string().trim().max(4000).optional(),
    clubId: z.string().uuid(),
    venueId: z.string().uuid().optional().or(z.literal("")),
    startsAt: z.string().min(1),
    endsAt: z.string().min(1),
    capacity: z.coerce.number().int().min(0).max(100000).optional().or(z.literal("")),
  })
  .strict();

/** A `datetime-local` value is IST wall-clock; convert it to a UTC instant. */
function istLocalToUTC(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const ms = Date.UTC(y, mo - 1, d, h, mi) - (5 * 60 + 30) * 60_000;
  return new Date(ms).toISOString();
}

export async function createEventAction(
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };

  const parsed = CreateSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    clubId: formData.get("clubId"),
    venueId: formData.get("venueId") || "",
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    capacity: formData.get("capacity") || "",
  });
  if (!parsed.success) return { error: "Check the form — some fields are missing or invalid." };
  const { title, description, clubId, venueId, capacity } = parsed.data;

  // Capability + club scope: a club-scoped role may only create for its own club.
  if (!canManage(session, "manage:events", clubId)) {
    return { error: "You can't create events for that club." };
  }

  const startsAt = istLocalToUTC(parsed.data.startsAt);
  const endsAt = istLocalToUTC(parsed.data.endsAt);
  if (!startsAt || !endsAt) return { error: "Enter a valid start and end time." };
  if (new Date(endsAt) <= new Date(startsAt)) {
    return { error: "The event must end after it starts." };
  }

  const admin = createAdminClient();

  // Blackout check (§13.2): does the event's IST date range hit a blackout?
  const startKey = istDateKey(startsAt);
  const endKey = istDateKey(endsAt);
  const { data: blackouts } = await admin
    .from("blackout_dates")
    .select("reason")
    .lte("starts_on", endKey)
    .gte("ends_on", startKey)
    .limit(1);
  if (blackouts && blackouts.length > 0) {
    return { error: `That date is blacked out: ${blackouts[0].reason}.` };
  }

  // Clash check (§6): same venue, overlapping time, not cancelled/rejected.
  const venue = venueId || null;
  if (venue) {
    const { data: clashes } = await admin
      .from("events")
      .select("title")
      .eq("venue_id", venue)
      .neq("status", "cancelled")
      .neq("approval_status", "rejected")
      .lt("starts_at", endsAt)
      .gt("ends_at", startsAt)
      .limit(1);
    if (clashes && clashes.length > 0) {
      return { error: `Venue clash with "${clashes[0].title}". Pick another time or room.` };
    }
  }

  const autoApproved = AUTO_APPROVE.includes(session.role);

  const { data: ev, error } = await admin
    .from("events")
    .insert({
      title,
      description: description ?? null,
      starts_at: startsAt,
      ends_at: endsAt,
      venue_id: venue,
      capacity: typeof capacity === "number" ? capacity : null,
      status: "published",
      approval_status: autoApproved ? "approved" : "pending",
      approved_by: autoApproved ? session.id : null,
      created_by: session.id,
    })
    .select("id")
    .single();
  if (error || !ev) return { error: "Could not save the event. Try again." };

  const { error: linkErr } = await admin
    .from("event_clubs")
    .insert({ event_id: ev.id, club_id: clubId, is_primary: true });
  if (linkErr) {
    await admin.from("events").delete().eq("id", ev.id); // avoid an orphan event
    return { error: "Could not link the event to its club. Try again." };
  }

  // Notify approvers when it needs approval (§9).
  if (!autoApproved) {
    const { data: heads } = await admin
      .from("admin_users")
      .select("email, full_name")
      .eq("role", "events_head")
      .eq("is_active", true);
    for (const h of heads ?? []) {
      await enqueueEmail({
        template: "event_submitted",
        toEmail: h.email,
        toName: h.full_name,
        subject: `Event pending approval: ${title}`,
        payload: { eventId: ev.id, title },
        priority: 2,
      });
    }
  }

  await writeAudit({
    actorId: session.id,
    action: "create",
    entity: "event",
    entityId: ev.id,
    after: { title, approval_status: autoApproved ? "approved" : "pending" },
  });

  redirect("/admin/events");
}

async function decide(
  formData: FormData,
  approved: boolean,
): Promise<void> {
  const session = await getAdminSession();
  if (!session || !canManage(session, "approve:events")) return;

  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) return;
  const reason = approved ? null : String(formData.get("reason") ?? "").trim().slice(0, 500);

  const admin = createAdminClient();
  const { data: ev } = await admin
    .from("events")
    .update({
      approval_status: approved ? "approved" : "rejected",
      approved_by: approved ? session.id : null,
      rejection_reason: reason,
    })
    .eq("id", eventId)
    .eq("approval_status", "pending")
    .select("id, title, created_by")
    .maybeSingle();
  if (!ev) return;

  if (ev.created_by) {
    const { data: submitter } = await admin
      .from("admin_users")
      .select("email, full_name")
      .eq("id", ev.created_by)
      .maybeSingle();
    if (submitter) {
      await enqueueEmail({
        template: approved ? "event_approved" : "event_rejected",
        toEmail: submitter.email,
        toName: submitter.full_name,
        subject: approved
          ? `Approved: ${ev.title}`
          : `Not approved: ${ev.title}`,
        payload: { eventId: ev.id, title: ev.title, reason },
        priority: 2,
      });
    }
  }

  await writeAudit({
    actorId: session.id,
    action: approved ? "approve" : "reject",
    entity: "event",
    entityId: ev.id,
    after: { approval_status: approved ? "approved" : "rejected", reason },
  });

  revalidatePath("/admin/events/approvals");
  revalidatePath("/admin/events");
}

export async function approveEventAction(formData: FormData): Promise<void> {
  await decide(formData, true);
}

export async function rejectEventAction(formData: FormData): Promise<void> {
  await decide(formData, false);
}
