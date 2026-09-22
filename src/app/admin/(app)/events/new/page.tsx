import { requireViewPage } from "@/lib/auth/guards";
import { grantFor } from "@/lib/auth/capabilities";
import { getClubOptions } from "@/lib/admin/queries";
import { EventForm } from "@/components/admin/EventForm";
import { createEventAction } from "../actions";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function NewEventPage() {
  const session = await requireViewPage("manage:events");
  const clubs = await getClubOptions();

  // Club-scoped roles create only for their own club; it's fixed, not chosen.
  const clubScoped = grantFor(session.role, "manage:events") === "own";
  const fixedClub =
    clubScoped && session.clubId
      ? clubs.find((c) => c.id === session.clubId) ?? null
      : null;

  return (
    <div className="admin-page event-editor-page">
      <Link href="/admin/events" className="event-back"><ArrowLeft size={15} aria-hidden="true" /> All events</Link>
      <div className="admin-page-head"><div><div className="eyebrow">Event editor</div>
      <h1 style={{ margin: "6px 0 0" }}>New event</h1></div></div>
      <p className="event-save-notice">
        {clubScoped
          ? "This goes to the Events Head for approval before it's public."
          : "Your role approves events, so this publishes on save."}
      </p>
      <EventForm
        action={createEventAction}
        clubs={clubs}
        fixedClub={fixedClub}
      />
    </div>
  );
}
