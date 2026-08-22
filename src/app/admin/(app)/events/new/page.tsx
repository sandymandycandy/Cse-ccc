import { requireViewPage } from "@/lib/auth/guards";
import { grantFor } from "@/lib/auth/capabilities";
import { getClubOptions, getVenueOptions } from "@/lib/admin/queries";
import { EventForm } from "@/components/admin/EventForm";
import { createEventAction } from "../actions";

export default async function NewEventPage() {
  const session = await requireViewPage("manage:events");
  const [clubs, venues] = await Promise.all([getClubOptions(), getVenueOptions()]);

  // Club-scoped roles create only for their own club; it's fixed, not chosen.
  const clubScoped = grantFor(session.role, "manage:events") === "own";
  const fixedClub =
    clubScoped && session.clubId
      ? clubs.find((c) => c.id === session.clubId) ?? null
      : null;

  return (
    <div className="admin-page" style={{ maxWidth: 640 }}>
      <div className="eyebrow">Events</div>
      <h1 style={{ margin: "6px 0 0" }}>New event</h1>
      <p className="lead" style={{ marginTop: 8 }}>
        {clubScoped
          ? "This goes to the Events Head for approval before it's public."
          : "Your role approves events, so this publishes on save."}
      </p>
      <EventForm
        action={createEventAction}
        clubs={clubs}
        venues={venues}
        fixedClub={fixedClub}
      />
    </div>
  );
}
