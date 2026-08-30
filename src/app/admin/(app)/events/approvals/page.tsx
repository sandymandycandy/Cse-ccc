import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { listPendingApprovals } from "@/lib/admin/queries";
import { istFullDate, istTime } from "@/lib/datetime";

export default async function ApprovalsPage() {
  await requireViewPage("approve:events");
  const pending = await listPendingApprovals();

  return (
    <div className="admin-page">
      <div className="eyebrow">Approvals</div>
      <h1 style={{ margin: "6px 0 0" }}>Approval queue</h1>
      <p className="lead" style={{ marginTop: 8 }}>
        Events submitted by club heads, waiting to go public. Open one to see the
        full details and registration form before you decide.
      </p>

      {pending.length === 0 ? (
        <div className="cal-empty">Nothing waiting for approval.</div>
      ) : (
        <div className="admin-approvals">
          {pending.map((e) => (
            <div className="card admin-approval" key={e.id}>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ marginBottom: 4 }}>{e.title}</h3>
                <div className="label" style={{ letterSpacing: ".08em" }}>
                  {e.club} · {istFullDate(e.startsAt)} · {istTime(e.startsAt)}
                </div>
              </div>
              <div className="admin-approval-actions">
                <Link href={`/admin/events/${e.id}/review`} className="btn btn-primary btn-sm">
                  Review →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
