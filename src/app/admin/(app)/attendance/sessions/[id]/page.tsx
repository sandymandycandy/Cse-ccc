import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, canViewClub } from "@/lib/auth/capabilities";
import { getSessionMarking } from "@/lib/admin/attendance-club";
import { SessionRoster } from "@/components/admin/SessionRoster";
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

  return (
    <div className="admin-page" style={{ maxWidth: 620 }}>
      <div className="eyebrow">Attendance · {istNumericDate(s.sessionDate ?? s.openedAt)}{slot}</div>
      <h1 style={{ margin: "6px 0 16px" }}>{s.title}</h1>
      {notice ? <div className="note" style={{ marginBottom: 16 }}>{notice}</div> : null}
      <SessionRoster sessionId={s.id} roster={detail.roster} canEdit={canEdit} status={s.status} />
    </div>
  );
}
