import { notFound } from "next/navigation";
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
    <div className="admin-page" style={{ maxWidth: 640 }}>
      <div className="eyebrow">Events</div>
      <h1 style={{ margin: "6px 0 0" }}>Edit event</h1>
      {event.approvalStatus === "rejected" ? (
        <div className="note" style={{ marginTop: 12, borderLeftColor: "var(--rust)" }}>
          <strong>Not approved.</strong>
          {event.rejectionReason ? ` ${event.rejectionReason}` : ""} Make your changes and save — the
          event is <strong>resubmitted for approval</strong>.
        </div>
      ) : null}
      <p className="lead" style={{ marginTop: 8 }}>
        {event.approvalStatus === "rejected"
          ? "Saving resends this event to the approval queue. Confirmed registrants are emailed whenever you change the details."
          : "Changes save immediately and don’t change the event’s approval status. Confirmed registrants are emailed whenever you change the details."}
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
        }}
      />

      <section className="rule" style={{ marginTop: 32, paddingTop: 24 }}>
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
