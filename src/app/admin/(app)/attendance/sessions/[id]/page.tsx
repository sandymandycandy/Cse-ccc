import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, canViewClub } from "@/lib/auth/capabilities";
import { getSessionMarking } from "@/lib/admin/attendance-club";
import { SessionRoster } from "@/components/admin/SessionRoster";
import { reopenSessionAction } from "../../actions";
import { istNumericDate } from "@/lib/datetime";

export default async function SessionPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; closed?: string; reopened?: string }>;
}) {
  const session = await requireViewPage("manage:members");
  const { id } = await params;
  const { saved, closed, reopened } = await searchParams;
  const detail = await getSessionMarking(id);
  if (!detail) notFound();
  if (!canViewClub(session, "manage:members", detail.session.clubId)) redirect("/admin/attendance");
  const canEdit = canManage(session, "manage:members", detail.session.clubId);
  const s = detail.session;
  const slot = s.startTime && s.endTime ? ` · ${s.startTime.slice(0, 5)}–${s.endTime.slice(0, 5)}` : "";
  const notice = closed ? "Session closed." : reopened ? "Session reopened." : saved ? "Attendance saved (draft)." : null;
  const isClosed = s.status === "closed";

  return (
    <div className="admin-page">
      <Link href="/admin/attendance" className="admin-back">
        ← Attendance
      </Link>
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">
            Attendance · {istNumericDate(s.sessionDate ?? s.openedAt)}{slot}
          </div>
          <h1 className="att-session-title">{s.title}</h1>
        </div>
        {/* Reopen sits beside Export rather than at the foot of the roster: on a
            closed session everything below is read-only, so the one control that
            changes that should not be a scroll away. */}
        <div className="att-head-actions">
          {canEdit && isClosed ? (
            <form action={reopenSessionAction}>
              <input type="hidden" name="sessionId" value={s.id} />
              <button className="btn btn-primary">Reopen session</button>
            </form>
          ) : null}
          <a href="/api/admin/attendance/export" className="btn btn-ghost">
            Export CSV
          </a>
        </div>
      </div>
      {notice ? <div className="note att-notice">{notice}</div> : null}
      <SessionRoster sessionId={s.id} roster={detail.roster} canEdit={canEdit} status={s.status} />
    </div>
  );
}
