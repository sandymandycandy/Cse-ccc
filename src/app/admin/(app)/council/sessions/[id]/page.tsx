import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, canView } from "@/lib/auth/capabilities";
import { getSessionMarking } from "@/lib/admin/attendance-council";
import { CouncilSessionRoster } from "@/components/admin/CouncilSessionRoster";
import { istNumericDate } from "@/lib/datetime";

export default async function CouncilSessionPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; closed?: string; reopened?: string }>;
}) {
  const session = await requireViewPage("manage:council");
  if (!canView(session, "manage:council")) redirect("/admin");
  const { id } = await params;
  const { saved, closed, reopened } = await searchParams;
  const detail = await getSessionMarking(id);
  if (!detail) notFound();
  const canEdit = canManage(session, "manage:council");
  const s = detail.session;
  const slot = s.startTime && s.endTime ? ` · ${s.startTime.slice(0, 5)}–${s.endTime.slice(0, 5)}` : "";
  const notice = closed ? "Meeting closed." : reopened ? "Meeting reopened." : saved ? "Attendance saved (draft)." : null;

  return (
    <div className="admin-page" style={{ maxWidth: 620 }}>
      <div className="eyebrow">Council · {istNumericDate(s.sessionDate ?? s.openedAt)}{slot}</div>
      <h1 style={{ margin: "6px 0 16px" }}>{s.title}</h1>
      {notice ? <div className="note" style={{ marginBottom: 16 }}>{notice}</div> : null}
      <CouncilSessionRoster sessionId={s.id} roster={detail.roster} canEdit={canEdit} status={s.status} />
    </div>
  );
}
