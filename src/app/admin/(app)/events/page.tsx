import Link from "next/link";
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
        <Link key="t" href={`/admin/events/${e.id}/registrations`} style={{ color: "var(--ink)" }}>
          {e.title}
        </Link>,
        e.club,
        <span key="w">
          {when}
          <span style={{ color: "var(--ink-3)" }}> · {istTime(e.startsAt)}</span>
        </span>,
        <ApprovalBadge key="a" status={e.approvalStatus} />,
        <Link
          key="p"
          href={`/admin/events/${e.id}/participants`}
          className="label"
          style={{ color: "var(--forest)" }}
        >
          People →
        </Link>,
        <Link
          key="m"
          href={`/admin/events/${e.id}/registrations`}
          className="label"
          style={{ color: "var(--forest)" }}
        >
          Mark →
        </Link>,
        <Link
          key="r"
          href={`/admin/events/${e.id}/results`}
          className="label"
          style={{ color: "var(--forest)" }}
        >
          Standings →
        </Link>,
        <Link
          key="e"
          href={`/admin/events/${e.id}/edit`}
          className="label"
          style={{ color: "var(--forest)" }}
        >
          Edit →
        </Link>,
      ],
    };
  });

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Events</div>
          <h1 style={{ margin: "8px 0 0" }}>Events</h1>
        </div>
        <Link href="/admin/events/new" className="btn btn-primary">
          New event
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="cal-empty">No events yet. Create the first one.</div>
      ) : (
        <AdminTable
          heading="Events"
          noun="event"
          columns={[
            { label: "Event" },
            { label: "Club" },
            { label: "When" },
            { label: "Approval" },
            { label: "Registered" },
            { label: "Attendance" },
            { label: "Results" },
            { label: "Edit" },
          ]}
          rows={rows}
          onRename={renameEventAction}
        />
      )}
    </div>
  );
}
