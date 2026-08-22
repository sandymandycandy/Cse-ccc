import { notFound } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { grantFor } from "@/lib/auth/capabilities";
import { getClubOptions, getVenueOptions, getEventForEdit } from "@/lib/admin/queries";
import { EventForm } from "@/components/admin/EventForm";
import { istLocalInput } from "@/lib/datetime";
import { updateEventAction } from "../../actions";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireViewPage("manage:events");
  const { id } = await params;

  const [event, clubs, venues] = await Promise.all([
    getEventForEdit(session, id),
    getClubOptions(),
    getVenueOptions(),
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

  return (
    <div className="admin-page" style={{ maxWidth: 640 }}>
      <div className="eyebrow">Events</div>
      <h1 style={{ margin: "6px 0 0" }}>Edit event</h1>
      <p className="lead" style={{ marginTop: 8 }}>
        Changes save immediately and don&rsquo;t change the event&rsquo;s approval
        status. Registrants are emailed if the date or venue changes.
      </p>
      <EventForm
        action={updateEventAction}
        clubs={clubs}
        venues={venues}
        fixedClub={fixedClub}
        eventId={event.id}
        submitLabel="Save changes"
        initial={{
          title: event.title,
          description: event.description ?? "",
          clubId: event.clubId ?? "",
          venueId: event.venueId ?? "",
          startsAtLocal: istLocalInput(event.startsAt),
          endsAtLocal: istLocalInput(event.endsAt),
          capacity: event.capacity != null ? String(event.capacity) : "",
        }}
      />
    </div>
  );
}
