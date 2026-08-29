import { notFound } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { grantFor, canManage } from "@/lib/auth/capabilities";
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
  // Fail closed: getEventForEdit returns null for a missing event or one outside
  // a club-scoped admin's club.
  if (!event) notFound();

  // Club-scoped roles keep the hosting club locked, same as create.
  const clubScoped = grantFor(session.role, "manage:events") === "own";
  const fixedClub =
    clubScoped && session.clubId
      ? clubs.find((c) => c.id === session.clubId) ?? null
      : null;

  const isCancelled = event.status === "cancelled";
  const canCancel = canManage(session, "cancel:events", event.clubId);

  return (
    <div className="admin-page" style={{ maxWidth: 640 }}>
      <div className="eyebrow">Events</div>
      <h1 style={{ margin: "6px 0 0" }}>Edit event</h1>
      <p className="lead" style={{ marginTop: 8 }}>
        Changes save immediately and don&rsquo;t change the event&rsquo;s approval
        status. Confirmed registrants are emailed whenever you change the details.
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
          venueText: event.venueText ?? "",
          startsAtLocal: istLocalInput(event.startsAt),
          endsAtLocal: istLocalInput(event.endsAt),
          capacity: event.capacity != null ? String(event.capacity) : "",
          posterUrl: event.posterUrl,
          selectionMode: event.selectionMode,
          registrationForm: JSON.stringify(event.registrationForm ?? defaultFormFor()),
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
