import { requireViewPage } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { listPendingApprovals } from "@/lib/admin/queries";
import {
  approveEventAction,
  rejectEventAction,
} from "@/app/admin/(app)/events/actions";
import { istFullDate, istTime } from "@/lib/datetime";

export default async function ApprovalsPage() {
  const session = await requireViewPage("approve:events");
  const canDecide = canManage(session, "approve:events");
  const pending = await listPendingApprovals();

  return (
    <div className="admin-page">
      <div className="eyebrow">Approvals</div>
      <h1 style={{ margin: "6px 0 0" }}>Approval queue</h1>
      <p className="lead" style={{ marginTop: 8 }}>
        Events submitted by club heads, waiting to go public.
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

              {canDecide ? (
                <div className="admin-approval-actions">
                  <form action={approveEventAction}>
                    <input type="hidden" name="eventId" value={e.id} />
                    <button type="submit" className="btn btn-accent btn-sm">
                      Approve
                    </button>
                  </form>
                  <form action={rejectEventAction} className="admin-reject">
                    <input type="hidden" name="eventId" value={e.id} />
                    <input name="reason" placeholder="Reason (optional)" />
                    <button type="submit" className="btn btn-ghost btn-sm">
                      Reject
                    </button>
                  </form>
                </div>
              ) : (
                <span className="label">Read-only</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
