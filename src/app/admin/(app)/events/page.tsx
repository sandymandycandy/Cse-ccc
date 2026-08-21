import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { listEventsForAdmin } from "@/lib/admin/queries";
import { ApprovalBadge } from "@/components/admin/ApprovalBadge";
import { istFullDate, istTime } from "@/lib/datetime";

export default async function AdminEventsPage() {
  const session = await requireViewPage("manage:events");
  const events = await listEventsForAdmin(session);

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Events</div>
          <h1 style={{ margin: "6px 0 0" }}>Events</h1>
        </div>
        <Link href="/admin/events/new" className="btn btn-primary">
          New event
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="cal-empty">No events yet. Create the first one.</div>
      ) : (
        <div className="tablewrap" style={{ marginTop: 18 }}>
          <table className="admin">
            <thead>
              <tr>
                <th>Event</th>
                <th>Club</th>
                <th>When</th>
                <th>Approval</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 500 }}>{e.title}</td>
                  <td>{e.club}</td>
                  <td>
                    {istFullDate(e.startsAt)}
                    <span style={{ color: "var(--ink-3)" }}> · {istTime(e.startsAt)}</span>
                  </td>
                  <td>
                    <ApprovalBadge status={e.approvalStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
