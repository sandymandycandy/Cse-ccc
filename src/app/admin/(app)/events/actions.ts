"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { enqueueEmail } from "@/lib/email";
import { writeAudit } from "@/lib/admin/audit";
import { istDateKey, istLocalToUTC } from "@/lib/datetime";
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

export async function updateEventAction(
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };

  const eventId = String(formData.get("eventId") ?? "");
  if (!z.string().uuid().safeParse(eventId).success) {
    return { error: "Missing event reference." };
  }

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

  const admin = createAdminClient();

  // Load the existing event (+ current primary club) to authorise and to diff.
  const { data: existingRaw } = await admin
    .from("events")
    .select("id, title, starts_at, ends_at, venue_id, status, event_clubs ( club_id, is_primary )")
    .eq("id", eventId)
    .maybeSingle();
  if (!existingRaw) return { error: "That event no longer exists." };
  const existing = existingRaw as unknown as {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string;
    venue_id: string | null;
    status: string;
    event_clubs: { club_id: string; is_primary: boolean }[];
  };
  const currentClubId =
    (existing.event_clubs.find((l) => l.is_primary) ?? existing.event_clubs[0])?.club_id ?? null;

  // Authorise: must manage the event's current club, and — if moving it — the new
  // club too. Club-scoped roles can therefore neither edit another club's event
  // nor hand one to another club.
  if (!canManage(session, "manage:events", currentClubId)) {
    return { error: "You can't edit that event." };
  }
  if (clubId !== currentClubId && !canManage(session, "manage:events", clubId)) {
    return { error: "You can't move the event to that club." };
  }

  const startsAt = istLocalToUTC(parsed.data.startsAt);
  const endsAt = istLocalToUTC(parsed.data.endsAt);
  if (!startsAt || !endsAt) return { error: "Enter a valid start and end time." };
  if (new Date(endsAt) <= new Date(startsAt)) {
    return { error: "The event must end after it starts." };
  }

  // Blackout check (§13.2).
  const { data: blackouts } = await admin
    .from("blackout_dates")
    .select("reason")
    .lte("starts_on", istDateKey(endsAt))
    .gte("ends_on", istDateKey(startsAt))
    .limit(1);
  if (blackouts && blackouts.length > 0) {
    return { error: `That date is blacked out: ${blackouts[0].reason}.` };
  }

  // Clash check (§6), excluding this event's own row.
  const venue = venueId || null;
  if (venue) {
    const { data: clashes } = await admin
      .from("events")
      .select("title")
      .eq("venue_id", venue)
      .neq("id", eventId)
      .neq("status", "cancelled")
      .neq("approval_status", "rejected")
      .lt("starts_at", endsAt)
      .gt("ends_at", startsAt)
      .limit(1);
    if (clashes && clashes.length > 0) {
      return { error: `Venue clash with "${clashes[0].title}". Pick another time or room.` };
    }
  }

  // Editing never re-triggers approval: status / approval_status / approved_by
  // are deliberately left untouched.
  const { error: updErr } = await admin
    .from("events")
    .update({
      title,
      description: description ?? null,
      starts_at: startsAt,
      ends_at: endsAt,
      venue_id: venue,
      capacity: typeof capacity === "number" ? capacity : null,
    })
    .eq("id", eventId);
  if (updErr) return { error: "Could not save your changes. Try again." };

  // Move the primary club link if the hosting club changed.
  if (clubId !== currentClubId) {
    const { error: linkErr } = await admin
      .from("event_clubs")
      .update({ club_id: clubId })
      .eq("event_id", eventId)
      .eq("is_primary", true);
    if (linkErr) return { error: "Saved, but couldn't update the hosting club. Try again." };
  }

  // Notify confirmed registrants when the time or venue materially changed on a
  // published event (§4a). Pure title/description/capacity edits stay quiet.
  const timeChanged = existing.starts_at !== startsAt || existing.ends_at !== endsAt;
  const venueChanged = (existing.venue_id ?? null) !== venue;
  if ((timeChanged || venueChanged) && existing.status === "published") {
    const { data: regs } = await admin
      .from("registrations")
      .select("email, student_name")
      .eq("event_id", eventId)
      .not("confirmed_at", "is", null);
    for (const r of regs ?? []) {
      await enqueueEmail({
        template: "event_updated",
        toEmail: r.email,
        toName: r.student_name,
        subject: `Updated: ${title}`,
        payload: { eventId, title, timeChanged, venueChanged },
        priority: 2,
      });
    }
  }

  await writeAudit({
    actorId: session.id,
    action: "update",
    entity: "event",
    entityId: eventId,
    before: {
      title: existing.title,
      starts_at: existing.starts_at,
      ends_at: existing.ends_at,
      venue_id: existing.venue_id,
      club_id: currentClubId,
    },
    after: { title, starts_at: startsAt, ends_at: endsAt, venue_id: venue, club_id: clubId },
  });

  redirect("/admin/events");
}

export async function duplicateEventAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const eventId = String(formData.get("eventId") ?? "");
  if (!z.string().uuid().safeParse(eventId).success) redirect("/admin/events");

  const admin = createAdminClient();
  const { data: srcRaw } = await admin
    .from("events")
    .select(
      "title, description, starts_at, ends_at, venue_id, capacity, event_clubs ( club_id, is_primary )",
    )
    .eq("id", eventId)
    .maybeSingle();
  if (!srcRaw) redirect("/admin/events");
  const src = srcRaw as unknown as {
    title: string;
    description: string | null;
    starts_at: string;
    ends_at: string;
    venue_id: string | null;
    capacity: number | null;
    event_clubs: { club_id: string; is_primary: boolean }[];
  };
  const clubId =
    (src.event_clubs.find((l) => l.is_primary) ?? src.event_clubs[0])?.club_id ?? null;
  if (!clubId || !canManage(session, "manage:events", clubId)) redirect("/admin/events");

  // Insert a DRAFT copy — schedule/venue are carried over but a draft holds no
  // booking, so we skip the clash/blackout checks here; the admin sets a fresh
  // date/venue on the edit page (where clash is re-checked on save). Registrations,
  // rounds, results and attendance are intentionally NOT copied.
  const { data: ev, error } = await admin
    .from("events")
    .insert({
      title: `Copy of ${src.title}`.slice(0, 140),
      description: src.description,
      starts_at: src.starts_at,
      ends_at: src.ends_at,
      venue_id: src.venue_id,
      capacity: src.capacity,
      status: "draft",
      approval_status: "pending",
      created_by: session.id,
    })
    .select("id")
    .single();
  if (error || !ev) redirect("/admin/events");

  const { error: linkErr } = await admin
    .from("event_clubs")
    .insert({ event_id: ev.id, club_id: clubId, is_primary: true });
  if (linkErr) {
    await admin.from("events").delete().eq("id", ev.id); // avoid an orphan event
    redirect("/admin/events");
  }

  await writeAudit({
    actorId: session.id,
    action: "duplicate",
    entity: "event",
    entityId: ev.id,
    after: { source: eventId, title: `Copy of ${src.title}`.slice(0, 140) },
  });

  redirect(`/admin/events/${ev.id}/edit`);
}

export async function cancelEventAction(
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };

  const eventId = String(formData.get("eventId") ?? "");
  if (!z.string().uuid().safeParse(eventId).success) return { error: "Missing event reference." };
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);

  const admin = createAdminClient();
  const { data: evRaw } = await admin
    .from("events")
    .select("title, status, event_clubs ( club_id, is_primary )")
    .eq("id", eventId)
    .maybeSingle();
  if (!evRaw) return { error: "That event no longer exists." };
  const ev = evRaw as unknown as {
    title: string;
    status: string;
    event_clubs: { club_id: string; is_primary: boolean }[];
  };
  const clubId =
    (ev.event_clubs.find((l) => l.is_primary) ?? ev.event_clubs[0])?.club_id ?? null;

  // Cancel is its own capability (§9): club heads may cancel their own club's
  // events, but vice heads (manage but not cancel) may not.
  if (!canManage(session, "cancel:events", clubId)) {
    return { error: "You can't cancel that event." };
  }
  if (ev.status === "cancelled") redirect("/admin/events"); // already cancelled

  const { error: updErr } = await admin
    .from("events")
    .update({ status: "cancelled" })
    .eq("id", eventId);
  if (updErr) return { error: "Could not cancel the event. Try again." };

  // Cancellation is material — tell confirmed registrants (§4a pattern).
  const { data: regs } = await admin
    .from("registrations")
    .select("email, student_name")
    .eq("event_id", eventId)
    .not("confirmed_at", "is", null);
  for (const r of regs ?? []) {
    await enqueueEmail({
      template: "event_cancelled",
      toEmail: r.email,
      toName: r.student_name,
      subject: `Cancelled: ${ev.title}`,
      payload: { eventId, title: ev.title, reason: reason || null },
      priority: 2,
    });
  }

  await writeAudit({
    actorId: session.id,
    action: "cancel",
    entity: "event",
    entityId: eventId,
    before: { status: ev.status },
    after: { status: "cancelled", reason: reason || null },
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
