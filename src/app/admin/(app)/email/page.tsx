import { requireViewPage } from "@/lib/auth/guards";
import { grantFor } from "@/lib/auth/capabilities";
import { listClubsBrief } from "@/lib/admin/clubs";
import { listEventsForAdmin } from "@/lib/admin/queries";
import { audienceCounts } from "@/lib/admin/broadcast-recipients";
import { INLINE_MAX } from "@/lib/admin/broadcast-audience";
import { BroadcastComposer } from "@/components/admin/BroadcastComposer";

/**
 * Compose a mail to a chosen audience. Gated on `manage:broadcast`; an `own`
 * holder is offered only their own club and their own club's events, and the
 * action re-checks against the database regardless of what the form posts.
 */
export default async function BroadcastPage() {
  const session = await requireViewPage("manage:broadcast");
  const councilWide = grantFor(session.role, "manage:broadcast") === "all";

  // `listEventsForAdmin` is already club-scoped and fails closed for a
  // club-scoped admin with no club, so the event picker inherits scope for free.
  const [clubs, events, counts] = await Promise.all([
    listClubsBrief(),
    listEventsForAdmin(session),
    audienceCounts(session.clubId),
  ]);

  const pickableClubs = councilWide
    ? clubs
    : clubs.filter((c) => c.id === session.clubId);

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Email</div>
          <h1 style={{ margin: "6px 0 0" }}>Write to a group</h1>
          <p className="body-text" style={{ marginTop: 6 }}>
            Anything over {INLINE_MAX} addresses is queued rather than sent at
            once, and goes out from the Outbox.
          </p>
        </div>
      </div>

      <BroadcastComposer
        councilWide={councilWide}
        clubs={pickableClubs}
        events={events.map((e) => ({ id: e.id, title: e.title }))}
        counts={counts}
      />
    </div>
  );
}
