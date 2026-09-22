import Link from "next/link";
import { Plus } from "lucide-react";
import { EventRowActions } from "@/components/admin/EventRowActions";
import { requireViewPage } from "@/lib/auth/guards";
import { listEventsForAdmin } from "@/lib/admin/queries";
import { ApprovalBadge } from "@/components/admin/ApprovalBadge";
import { istNumericDate, istTime } from "@/lib/datetime";
import { AdminTable, type AdminTableRow } from "@/components/admin/AdminTable";
import { renameEventAction } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export default async function AdminEventsPage() {
  const session = await requireViewPage("manage:events");
  const events = await listEventsForAdmin(session);

  const rows: AdminTableRow[] = events.map((e) => {
    const when = istNumericDate(e.startsAt);
    const status = STATUS_LABEL[e.approvalStatus] ?? e.approvalStatus;

    return {
      key: e.id,
      status,
      rename: e.title,
      values: [e.title, e.club, when, status],
      cells: [
        <Link key="t" href={`/admin/events/${e.id}/edit`} className="event-title-link">
          {e.title}
        </Link>,
        e.club,
        <span key="w" className="event-schedule">
          {when}
          <small>{istTime(e.startsAt)} IST</small>
        </span>,
        <ApprovalBadge key="a" status={e.approvalStatus} />,
        <EventRowActions key="actions" id={e.id} title={e.title} />,
      ],
    };
  });

  return (
    <div className="admin-page admin-events-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Programme</div>
          <h1 style={{ margin: "8px 0 0" }}>Events</h1>
        </div>
        <Link href="/admin/events/new" className="btn btn-primary">
          <Plus size={17} aria-hidden="true" /> New event
        </Link>
      </div>
      <p className="admin-lead">Manage your events, follow approvals and keep registration details up to date.</p>

      {events.length === 0 ? (
        <div className="cal-empty">No events yet. Create the first one.</div>
      ) : (
        <AdminTable
          heading="Events"
          noun="event"
          columns={[
            { label: "Event", wrap: true },
            { label: "Club" },
            { label: "Schedule" },
            { label: "Approval" },
            { label: "Actions", action: true },
          ]}
          rows={rows}
          onRename={renameEventAction}
        />
      )}
    </div>
  );
}
