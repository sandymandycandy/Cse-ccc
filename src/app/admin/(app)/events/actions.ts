"use server";

import { redirect } from "next/navigation";
import { capacityValue } from "@/lib/admin/event-capacity";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import {
  NO_HOSTS,
  canCancelEvent,
  canManageEvent,
  canSetPrimary,
  cohostIdsOf,
  hostsForCopy,
  hostsFromLinks,
  isEmptyPlan,
  normalizeCohosts,
  planHostChanges,
} from "@/lib/admin/event-hosts";
import { applyHostPlan, notActiveClubIds } from "@/lib/admin/event-host-store";
import { enqueueEmail } from "@/lib/email";
import { teamRecipients } from "@/lib/registration-form/recipients";
import { getEventFormSchema } from "@/lib/admin/registrations";
import { writeAudit } from "@/lib/admin/audit";
import { handleImageUpload } from "@/lib/admin/image-upload";
import { validateFormSchema, defaultFormFor } from "@/lib/registration-form/schema";
import { parseSchedule } from "@/lib/registration/schedule";
import { isGroupLink } from "@/lib/registration/whatsapp";
import { istDateKey, istLocalToUTC } from "@/lib/datetime";
import type { Json } from "@/lib/database.types";
import type { AdminRole } from "@/lib/auth/capabilities";
import { toFieldErrors } from "@/lib/admin/field-errors";
import type { EventFormState } from "@/lib/admin/form-state";

const POSTER_BUCKET = "event-posters";
const COHOST_REFUSED = "One of those clubs can't co-host. Pick from the list.";

// Roles whose own events skip the approval queue (§9).
const AUTO_APPROVE: AdminRole[] = [
  "tech_head",
  "president",
  "vice_president",
  "events_head",
];

const CreateSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Give the event a title — at least 3 characters.")
      .max(140, "Keep the title to 140 characters or fewer."),
    description: z
      .string()
      .trim()
      .max(4000, "Keep the description to 4000 characters or fewer.")
      .optional(),
    // The one-liner on the event cards; matches the DB check on events.summary.
    summary: z.string().trim().max(200, "Keep the short description to 200 characters or fewer.").optional(),
    clubId: z.string().uuid("Choose which club is hosting."),
    cohostIds: z
      .array(z.string().uuid("Pick co-hosts from the list."))
      .max(10, "An event can have at most 10 co-hosts.")
      .default([]),
    venueText: z
      .string()
      .trim()
      .max(120, "Keep the venue to 120 characters or fewer.")
      .optional(),
    startsAt: z.string().min(1, "Pick when it starts."),
    endsAt: z.string().min(1, "Pick when it ends."),
    capacity: z.coerce
      .number()
      .int("Capacity must be a whole number.")
      .min(0, "Capacity cannot be negative.")
      .max(100000, "That capacity is too large.")
      .optional()
      .or(z.literal("")),
    selectionMode: z.enum(["seats", "shortlist"]).default("seats"),
    registrationForm: z.string().optional(), // JSON; validated with validateFormSchema
    registrationOpensAt: z.string().optional(), // IST datetime-local; validated in parseSchedule
    registrationClosesAt: z.string().optional(),
    waitlistEnabled: z.coerce.boolean().optional(),
    showOnAchievements: z.coerce.boolean().optional(),
    // The group chat a registrant is shown after registering. Validated against
    // the same rule the API and the email re-check before rendering an href —
    // https only, so nothing else can reach a link on a public page.
    whatsappUrl: z
      .string()
      .trim()
      .refine(isGroupLink, "Paste the full invite link — it must start with https://")
      .optional(),
  })
  .strict();

function parseEvent(formData: FormData) {
  return CreateSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    summary: formData.get("summary") || undefined,
    clubId: formData.get("clubId"),
    // One entry per ticked checkbox; none ticked is an empty list.
    cohostIds: formData.getAll("cohostIds").map(String),
    venueText: formData.get("venueText") || undefined,
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    capacity: formData.get("capacity") || "",
    selectionMode: formData.get("selectionMode") || "seats",
    registrationForm: formData.get("registrationForm") || undefined,
    registrationOpensAt: formData.get("registrationOpensAt") || undefined,
    registrationClosesAt: formData.get("registrationClosesAt") || undefined,
    waitlistEnabled: formData.get("waitlistEnabled") === "on",
    showOnAchievements: formData.get("showOnAchievements") === "on",
    whatsappUrl: formData.get("whatsappUrl") || undefined,
  });
}

/** Validate the builder's JSON, falling back to the default six-field form. */
function parseRegistrationForm(
  json: string | undefined,
): { ok: true; value: Json } | { ok: false; error: string } {
  if (!json) return { ok: true, value: defaultFormFor() as unknown as Json };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "The registration form is malformed." };
  }
  const parsed = validateFormSchema(raw);
  if (!parsed.ok) return { ok: false, error: parsed.errors[0] ?? "Fix the registration form." };
  return { ok: true, value: parsed.fields as unknown as Json };
}

export async function createEventAction(
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };

  const parsed = parseEvent(formData);
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };
  const { title, description, clubId, venueText, capacity, selectionMode } = parsed.data;

  // Capability + club scope: a club-scoped role may only create for its own club.
  if (!canManage(session, "manage:events", clubId)) {
    return { error: "You can't create events for that club." };
  }

  // Co-hosts are picked directly, with no consent step (spec §2): the audit log
  // records who added whom. A club-scoped creator's own club stays the primary,
  // which the check above already guarantees.
  const cohostIds = normalizeCohosts(clubId, parsed.data.cohostIds);
  if ((await notActiveClubIds(cohostIds)).length > 0) {
    return { fieldErrors: { cohostIds: COHOST_REFUSED } };
  }

  const form = parseRegistrationForm(parsed.data.registrationForm);
  if (!form.ok) return { error: form.error };

  const startsAt = istLocalToUTC(parsed.data.startsAt);
  const endsAt = istLocalToUTC(parsed.data.endsAt);
  if (!startsAt || !endsAt) {
    return {
      fieldErrors: {
        ...(startsAt ? {} : { startsAt: "That is not a valid date and time." }),
        ...(endsAt ? {} : { endsAt: "That is not a valid date and time." }),
      },
    };
  }
  if (new Date(endsAt) <= new Date(startsAt)) {
    return { fieldErrors: { endsAt: "It must end after it starts." } };
  }

  const sched = parseSchedule(
    parsed.data.registrationOpensAt ?? "",
    parsed.data.registrationClosesAt ?? "",
    startsAt,
  );
  if (!sched.ok) return { error: sched.error };

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

  // Clash check (§6): same venue (case-insensitive exact match on the typed
  // name), overlapping time, not cancelled/rejected.
  const venue = venueText || null;
  if (venue) {
    const { data: clashes } = await admin
      .from("events")
      .select("title")
      .ilike("venue_text", venue)
      .neq("status", "cancelled")
      .neq("approval_status", "rejected")
      .lt("starts_at", endsAt)
      .gt("ends_at", startsAt)
      .limit(1);
    if (clashes && clashes.length > 0) {
      return { error: `Venue clash with "${clashes[0].title}". Pick another time or room.` };
    }
  }

  // Optional cover poster (uploaded via the service role to the public bucket).
  const poster = await handleImageUpload(formData, { bucket: POSTER_BUCKET });
  if (poster.error) return { error: poster.error };

  const autoApproved = AUTO_APPROVE.includes(session.role);

  const { data: ev, error } = await admin
    .from("events")
    .insert({
      title,
      description: description ?? null,
      starts_at: startsAt,
      ends_at: endsAt,
      venue_text: venue,
      poster_path: poster.path ?? null,
      capacity: capacityValue(capacity),
      selection_mode: selectionMode,
      registration_form: form.value,
      registration_opens_at: sched.opensAt,
      registration_closes_at: sched.closesAt,
      waitlist_enabled: parsed.data.waitlistEnabled ?? true,
      show_on_achievements: parsed.data.showOnAchievements ?? true,
      whatsapp_url: parsed.data.whatsappUrl ?? null,
      summary: parsed.data.summary || null,
      status: "published",
      approval_status: autoApproved ? "approved" : "pending",
      approved_by: autoApproved ? session.id : null,
      created_by: session.id,
    })
    .select("id")
    .single();
  if (error || !ev) {
    if (poster.path) await admin.storage.from(POSTER_BUCKET).remove([poster.path]);
    return { error: "Could not save the event. Try again." };
  }

  const linked = await applyHostPlan(
    ev.id,
    planHostChanges(NO_HOSTS, { primaryClubId: clubId, cohostIds }),
  );
  if (!linked) {
    // Avoid an orphan event; any link rows already written cascade with it.
    await admin.from("events").delete().eq("id", ev.id);
    if (poster.path) await admin.storage.from(POSTER_BUCKET).remove([poster.path]);
    return { error: "Could not link the event to its clubs. Try again." };
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
  if (cohostIds.length > 0) {
    await writeAudit({
      actorId: session.id,
      action: "event_cohosts_changed",
      entity: "event",
      entityId: ev.id,
      before: { primary_club_id: null, cohost_ids: [] },
      after: { primary_club_id: clubId, cohost_ids: cohostIds },
    });
  }

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

  const parsed = parseEvent(formData);
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };
  const { title, description, clubId, venueText, capacity, selectionMode } = parsed.data;

  const form = parseRegistrationForm(parsed.data.registrationForm);
  if (!form.ok) return { error: form.error };

  const admin = createAdminClient();

  // Load the existing event (+ current primary club) to authorise and to diff.
  const { data: existingRaw } = await admin
    .from("events")
    .select(
      "id, title, description, starts_at, ends_at, venue_text, poster_path, capacity, status, " +
        "approval_status, event_clubs ( club_id, is_primary )",
    )
    .eq("id", eventId)
    .maybeSingle();
  if (!existingRaw) return { error: "That event no longer exists." };
  const existing = existingRaw as unknown as {
    id: string;
    title: string;
    description: string | null;
    starts_at: string;
    ends_at: string;
    venue_text: string | null;
    poster_path: string | null;
    capacity: number | null;
    status: string;
    approval_status: string;
    event_clubs: { club_id: string; is_primary: boolean }[];
  };
  const hosts = hostsFromLinks(existing.event_clubs);
  const cohostIds = normalizeCohosts(clubId, parsed.data.cohostIds);

  // Authorise through ANY hosting club: a co-host edits the event like its owner.
  if (!canManageEvent(session, "manage:events", hosts)) {
    return { error: "You can't edit that event." };
  }
  // Changing which club OWNS the event is narrower. A co-host may add and remove
  // co-hosts, itself included, but never take the primary, or it could lock the
  // owning club out of cancelling its own event. And no club-scoped role may hand
  // an event to a club it does not manage, which this action has always refused,
  // so in practice only council roles reassign the primary.
  if (
    clubId !== hosts.primaryClubId &&
    (!canSetPrimary(session, hosts) || !canManage(session, "manage:events", clubId))
  ) {
    return { error: "Only the owning club or the council can change which club hosts this event." };
  }
  const hostPlan = planHostChanges(hosts, { primaryClubId: clubId, cohostIds });
  // Only NEW co-hosts are checked. A co-host kept from before stays even if its
  // club has since been made inactive.
  if ((await notActiveClubIds(hostPlan.addCohosts)).length > 0) {
    return { fieldErrors: { cohostIds: COHOST_REFUSED } };
  }

  const startsAt = istLocalToUTC(parsed.data.startsAt);
  const endsAt = istLocalToUTC(parsed.data.endsAt);
  if (!startsAt || !endsAt) {
    return {
      fieldErrors: {
        ...(startsAt ? {} : { startsAt: "That is not a valid date and time." }),
        ...(endsAt ? {} : { endsAt: "That is not a valid date and time." }),
      },
    };
  }
  if (new Date(endsAt) <= new Date(startsAt)) {
    return { fieldErrors: { endsAt: "It must end after it starts." } };
  }

  const sched = parseSchedule(
    parsed.data.registrationOpensAt ?? "",
    parsed.data.registrationClosesAt ?? "",
    startsAt,
  );
  if (!sched.ok) return { error: sched.error };

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
  const venue = venueText || null;
  if (venue) {
    const { data: clashes } = await admin
      .from("events")
      .select("title")
      .ilike("venue_text", venue)
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

  // Optional replacement cover poster.
  const poster = await handleImageUpload(formData, { bucket: POSTER_BUCKET });
  if (poster.error) return { error: poster.error };

  // Editing never re-triggers approval: status / approval_status / approved_by
  // are deliberately left untouched.
  const update: {
    title: string;
    description: string | null;
    starts_at: string;
    ends_at: string;
    venue_text: string | null;
    capacity: number | null;
    selection_mode: "seats" | "shortlist";
    registration_form: Json;
    registration_opens_at: string | null;
    registration_closes_at: string | null;
    waitlist_enabled: boolean;
    show_on_achievements: boolean;
    whatsapp_url: string | null;
    summary: string | null;
    poster_path?: string;
  } = {
    title,
    description: description ?? null,
    starts_at: startsAt,
    ends_at: endsAt,
    venue_text: venue,
    capacity: capacityValue(capacity),
    selection_mode: selectionMode,
    registration_form: form.value,
    registration_opens_at: sched.opensAt,
    registration_closes_at: sched.closesAt,
    waitlist_enabled: parsed.data.waitlistEnabled ?? true,
    show_on_achievements: parsed.data.showOnAchievements ?? true,
    whatsapp_url: parsed.data.whatsappUrl ?? null,
    summary: parsed.data.summary || null,
  };
  if (poster.path) update.poster_path = poster.path;

  const { error: updErr } = await admin.from("events").update(update).eq("id", eventId);
  if (updErr) {
    if (poster.path) await admin.storage.from(POSTER_BUCKET).remove([poster.path]);
    return { error: "Could not save your changes. Try again." };
  }
  // Replaced poster → drop the old object so it doesn't orphan in Storage.
  if (poster.path && existing.poster_path) {
    await admin.storage.from(POSTER_BUCKET).remove([existing.poster_path]);
  }

  // Reconcile the hosting clubs: add and remove co-hosts, and move the primary
  // if a council role changed it. Adding a co-host never re-triggers approval.
  if (!isEmptyPlan(hostPlan)) {
    if (!(await applyHostPlan(eventId, hostPlan))) {
      return { error: "Saved, but couldn't update the hosting clubs. Try again." };
    }
    await writeAudit({
      actorId: session.id,
      action: "event_cohosts_changed",
      entity: "event",
      entityId: eventId,
      before: { primary_club_id: hosts.primaryClubId, cohost_ids: cohostIdsOf(hosts) },
      after: { primary_club_id: clubId, cohost_ids: cohostIds },
    });
  }

  // Resubmit: editing a REJECTED event sends it back to the approval queue with a
  // clean slate, and re-notifies the approvers. (Approved/pending events keep
  // their status — editing them never re-triggers approval.)
  if (existing.approval_status === "rejected") {
    await admin
      .from("events")
      .update({ approval_status: "pending", rejection_reason: null, approved_by: null })
      .eq("id", eventId);
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
        subject: `Event resubmitted: ${title}`,
        payload: { eventId, title },
        priority: 2,
      });
    }
  }

  // Notify confirmed registrants when ANYTHING material changed on a published
  // event — title, description, time, venue or capacity (owner request; was
  // previously time/venue only). A new poster alone doesn't notify.
  const timeChanged = existing.starts_at !== startsAt || existing.ends_at !== endsAt;
  const venueChanged = (existing.venue_text ?? null) !== venue;
  const titleChanged = existing.title !== title;
  const descChanged = (existing.description ?? null) !== (description ?? null);
  const capacityChanged =
    (existing.capacity ?? null) !== (typeof capacity === "number" ? capacity : null);
  const anyChanged = timeChanged || venueChanged || titleChanged || descChanged || capacityChanged;

  if (anyChanged && existing.status === "published") {
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const { data: regs } = await admin
      .from("registrations")
      .select("email, student_name")
      .eq("event_id", eventId)
      .not("confirmed_at", "is", null);
    for (const r of regs ?? []) {
      if (!r.email) continue;
      await enqueueEmail({
        template: "event_updated",
        toEmail: r.email,
        toName: r.student_name ?? undefined,
        subject: `Updated: ${title}`,
        payload: { eventId, title, url: base ? `${base}/events/${eventId}` : undefined, timeChanged, venueChanged },
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
      venue_text: existing.venue_text,
      club_id: hosts.primaryClubId,
    },
    after: { title, starts_at: startsAt, ends_at: endsAt, venue_text: venue, club_id: clubId },
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
      "title, description, summary, starts_at, ends_at, venue_text, capacity, whatsapp_url, event_clubs ( club_id, is_primary )",
    )
    .eq("id", eventId)
    .maybeSingle();
  if (!srcRaw) redirect("/admin/events");
  const src = srcRaw as unknown as {
    title: string;
    description: string | null;
    starts_at: string;
    ends_at: string;
    venue_text: string | null;
    capacity: number | null;
    whatsapp_url: string | null;
    summary: string | null;
    event_clubs: { club_id: string; is_primary: boolean }[];
  };
  const hosts = hostsFromLinks(src.event_clubs);
  if (!hosts.primaryClubId || !canManageEvent(session, "manage:events", hosts)) {
    redirect("/admin/events");
  }
  // A duplicate is a creation: a co-host's copy is owned by their own club.
  const copy = hostsForCopy(session, hosts);

  // Insert a DRAFT copy — schedule/venue are carried over but a draft holds no
  // booking, so we skip the clash/blackout checks here; the admin sets a fresh
  // date/venue on the edit page (where clash is re-checked on save). The poster,
  // registrations, rounds, results and attendance are intentionally NOT copied.
  const { data: ev, error } = await admin
    .from("events")
    .insert({
      title: `Copy of ${src.title}`.slice(0, 140),
      description: src.description,
      starts_at: src.starts_at,
      ends_at: src.ends_at,
      venue_text: src.venue_text,
      capacity: src.capacity,
      whatsapp_url: src.whatsapp_url,
      summary: src.summary,
      status: "draft",
      approval_status: "pending",
      created_by: session.id,
    })
    .select("id")
    .single();
  if (error || !ev) redirect("/admin/events");

  const linked = await applyHostPlan(
    ev.id,
    planHostChanges(NO_HOSTS, {
      primaryClubId: copy.primaryClubId ?? hosts.primaryClubId,
      cohostIds: cohostIdsOf(copy),
    }),
  );
  if (!linked) {
    await admin.from("events").delete().eq("id", ev.id); // avoid an orphan event
    redirect("/admin/events");
  }

  await writeAudit({
    actorId: session.id,
    action: "duplicate",
    entity: "event",
    entityId: ev.id,
    after: {
      source: eventId,
      title: `Copy of ${src.title}`.slice(0, 140),
      primary_club_id: copy.primaryClubId,
      cohost_ids: cohostIdsOf(copy),
    },
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
  // Cancel is its own capability (§9), and it stays with the club that OWNS the
  // event: a co-host can edit, take attendance and enter results, but not cancel.
  // Vice heads (manage but not cancel) still may not.
  if (!canCancelEvent(session, hostsFromLinks(ev.event_clubs))) {
    return { error: "You can't cancel that event." };
  }
  if (ev.status === "cancelled") redirect("/admin/events"); // already cancelled

  const { error: updErr } = await admin
    .from("events")
    .update({ status: "cancelled" })
    .eq("id", eventId);
  if (updErr) return { error: "Could not cancel the event. Try again." };

  // Cancellation is material — tell confirmed registrants (§4a pattern), and
  // tell their TEAMMATES too: a member who only hears from the person who filled
  // the form in is a member who turns up to a cancelled event.
  const { data: regs } = await admin
    .from("registrations")
    .select("email, student_name, custom_answers")
    .eq("event_id", eventId)
    .not("confirmed_at", "is", null);
  const { schema: cancelSchema } = await getEventFormSchema(eventId);
  for (const r of regs ?? []) {
    const recipients = teamRecipients(
      cancelSchema,
      r.custom_answers as Record<string, unknown> | null,
      r.email,
    );
    for (const to of recipients) {
      await enqueueEmail({
        template: "event_cancelled",
        toEmail: to,
        toName: to === r.email?.toLowerCase() ? (r.student_name ?? undefined) : undefined,
        subject: `Cancelled: ${ev.title}`,
        payload: { eventId, title: ev.title, reason: reason || null },
        priority: 2,
      });
    }
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
  if (!ev) redirect("/admin/events/approvals");

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
  redirect("/admin/events/approvals");
}

export async function approveEventAction(formData: FormData): Promise<void> {
  await decide(formData, true);
}

export async function rejectEventAction(formData: FormData): Promise<void> {
  await decide(formData, false);
}

/**
 * Inline rename from the events list — title only.
 *
 * Authorised through ANY hosting club, the same as `updateEventAction`: a
 * co-host edits the event like its owner, and authorising on the primary alone
 * would refuse a co-host the rename it is allowed to make on the full form.
 *
 * Approval state is deliberately left alone. A title fix is not a resubmission,
 * and bouncing an approved event back to pending over a typo would cost the
 * club its slot.
 */
export async function renameEventAction(
  id: string,
  title: string,
): Promise<{ ok: true } | { ok: false; error?: string }> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Your session expired. Sign in again." };
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Missing event reference." };
  }

  const parsed = CreateSchema.shape.title.safeParse(title);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const admin = createAdminClient();
  const { data: existingRaw } = await admin
    .from("events")
    .select("id, title, event_clubs ( club_id, is_primary )")
    .eq("id", id)
    .maybeSingle();
  if (!existingRaw) return { ok: false, error: "That event no longer exists." };
  const existing = existingRaw as unknown as {
    id: string;
    title: string;
    event_clubs: { club_id: string; is_primary: boolean }[];
  };

  if (!canManageEvent(session, "manage:events", hostsFromLinks(existing.event_clubs))) {
    return { ok: false, error: "You can't edit that event." };
  }

  const { error } = await admin.from("events").update({ title: parsed.data }).eq("id", id);
  if (error) return { ok: false, error: "Could not save that. Try again." };

  await writeAudit({
    actorId: session.id,
    action: "update",
    entity: "event",
    entityId: id,
    before: { title: existing.title },
    after: { title: parsed.data },
  });

  // The title is on the public site as well as this table.
  revalidatePath("/admin/events");
  revalidatePath(`/events/${id}`);
  return { ok: true };
}
