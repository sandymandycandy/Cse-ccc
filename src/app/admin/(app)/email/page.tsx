import { requireViewPage } from "@/lib/auth/guards";
import { grantFor } from "@/lib/auth/capabilities";
import { listClubsBrief } from "@/lib/admin/clubs";
import { listEventsForAdmin } from "@/lib/admin/queries";
import { audienceCounts } from "@/lib/admin/broadcast-recipients";
import { INLINE_MAX } from "@/lib/admin/broadcast-audience";
import { BroadcastComposer } from "@/components/admin/BroadcastComposer";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

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
    <div className="admin-page email-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Communications</div>
          <h1 style={{ margin: "6px 0 0" }}>Write to a group</h1>
        </div>
        <Link href="/admin/outbox" className="btn btn-ghost">View outbox <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </div>
      <p className="admin-lead">Choose your audience, write a message and review it before sending.</p>
      <p className="email-delivery-note">Messages to more than {INLINE_MAX} addresses are queued in the <Link href="/admin/outbox">Outbox</Link>.</p>

      <BroadcastComposer
        councilWide={councilWide}
        clubs={pickableClubs}
        events={events.map((e) => ({ id: e.id, title: e.title }))}
        counts={counts}
      />
    </div>
  );
}
