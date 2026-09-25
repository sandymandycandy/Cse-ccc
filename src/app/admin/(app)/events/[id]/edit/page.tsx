import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardCheck, ListChecks } from "lucide-react";
import { ApprovalBadge } from "@/components/admin/ApprovalBadge";
import { requireViewPage } from "@/lib/auth/guards";
import { grantFor } from "@/lib/auth/capabilities";
import { canCancelEvent } from "@/lib/admin/event-hosts";
import { getClubOptions, getEventForEdit } from "@/lib/admin/queries";
import { EventForm } from "@/components/admin/EventForm";
import { CancelEventForm } from "@/components/admin/CancelEventForm";
import { istLocalInput } from "@/lib/datetime";
import { defaultFormFor } from "@/lib/registration-form/schema";
import { updateEventAction, duplicateEventAction } from "../../actions";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireViewPage("manage:events");
  const { id } = await params;

  const [event, clubs] = await Promise.all([
    getEventForEdit(session, id),
    getClubOptions(),
  ]);
  // Fail closed: getEventForEdit returns null for a missing event or one this
  // admin's club does not host.
  if (!event) notFound();

  // Club-scoped roles keep the hosting club locked, locked to the club that OWNS
  // the event. ⚠️ Not to their own club: for a co-host those differ, and posting
  // their own club here would read as taking the primary, so every save a
  // co-host made would be refused.
  const clubScoped = grantFor(session.role, "manage:events") === "own";
  const fixedClub = clubScoped ? clubs.find((c) => c.id === event.clubId) ?? null : null;

  const isCancelled = event.status === "cancelled";
  const canCancel = canCancelEvent(session, event.hosts);

  return (
    <div className="admin-page event-editor-page">
      <Link href="/admin/events" className="event-back"><ArrowLeft size={15} aria-hidden="true" /> All events</Link>
      <div className="admin-page-head"><div><div className="eyebrow">Event editor</div>
      <h1 style={{ margin: "6px 0 0" }}>Edit event</h1></div>
      <div className="stack" style={{ gap: 10 }}>
        {event.selectionMode === "shortlist" ? <Link href={`/admin/events/${id}/shortlist`} className="btn btn-ghost btn-sm"><ListChecks size={16} aria-hidden="true" /> Review &amp; shortlist</Link> : null}
        <Link href={`/admin/events/${id}/registrations`} className="btn btn-ghost btn-sm"><ClipboardCheck size={16} aria-hidden="true" /> Registrations & attendance</Link>
      </div></div>
      <div className="event-editor-identity"><span>{event.title}</span><ApprovalBadge status={event.approvalStatus} /></div>
      {event.approvalStatus === "rejected" ? (
        <div className="note" style={{ marginTop: 12, borderLeftColor: "var(--rust)" }}>
          <strong>Not approved.</strong>
          {event.rejectionReason ? ` ${event.rejectionReason}` : ""} Make your changes and save — the
          event is <strong>resubmitted for approval</strong>.
        </div>
      ) : null}
      <p className="event-save-notice">
        {event.approvalStatus === "rejected"
          ? "Select Save changes to resubmit this event for approval."
          : "Select Save changes to apply your edits. The event’s approval status stays the same."}
        {event.status === "published" ? " Saving changes to the title, description, schedule, venue or capacity emails confirmed registrants." : ""}
      </p>
      <EventForm
        action={updateEventAction}
        clubs={clubs}
        fixedClub={fixedClub}
        eventId={event.id}
        submitLabel="Save changes"
        initial={{
          title: event.title,
          description: event.description ?? "",
          clubId: event.clubId ?? "",
          cohostIds: event.cohostIds,
          venueText: event.venueText ?? "",
          startsAtLocal: istLocalInput(event.startsAt),
          endsAtLocal: istLocalInput(event.endsAt),
          capacity: event.capacity != null ? String(event.capacity) : "",
          posterUrl: event.posterUrl,
          selectionMode: event.selectionMode,
          registrationForm: JSON.stringify(event.registrationForm ?? defaultFormFor()),
          registrationOpensAtLocal: event.registrationOpensAt ? istLocalInput(event.registrationOpensAt) : "",
          registrationClosesAtLocal: event.registrationClosesAt ? istLocalInput(event.registrationClosesAt) : "",
          waitlistEnabled: event.waitlistEnabled,
          showOnAchievements: event.showOnAchievements,
          whatsappUrl: event.whatsappUrl ?? "",
          summary: event.summary ?? "",
        }}
      />

      <section className="event-lifecycle">
        <h2 style={{ font: "400 20px var(--serif)", margin: 0 }}>More actions</h2>

        {isCancelled ? (
          <div className="note" style={{ marginTop: 14 }}>
            This event is <strong>cancelled</strong>. Duplicate it to run it again.
          </div>
        ) : null}

        <div style={{ marginTop: 16 }}>
          <div className="label" style={{ marginBottom: 6 }}>
            Duplicate
          </div>
          <p className="body-text" style={{ fontSize: 13, marginBottom: 10, color: "var(--ink-2)" }}>
            Creates a draft copy (&ldquo;Copy of…&rdquo;) with this event&rsquo;s details —
            registrations and results are not copied. Opens it here so you can set a new
            date and venue.
          </p>
          <form action={duplicateEventAction}>
            <input type="hidden" name="eventId" value={event.id} />
            <button type="submit" className="btn">
              Duplicate as draft
            </button>
          </form>
        </div>

        {canCancel && !isCancelled ? (
          <div style={{ marginTop: 24 }}>
            <div className="label" style={{ marginBottom: 6, color: "var(--rust)" }}>
              Cancel event
            </div>
            <p className="body-text" style={{ fontSize: 13, marginBottom: 10, color: "var(--ink-2)" }}>
              Marks the event cancelled and emails confirmed registrants. This can&rsquo;t
              be undone here.
            </p>
            <CancelEventForm eventId={event.id} />
          </div>
        ) : null}
      </section>
    </div>
  );
}
