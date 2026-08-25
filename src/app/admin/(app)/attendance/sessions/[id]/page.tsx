import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, canViewClub } from "@/lib/auth/capabilities";
import { getSessionDetail } from "@/lib/admin/attendance-club";
import { LiveSession } from "@/components/admin/LiveSession";
import { closeSessionAction } from "../../actions";
import { istNumericDate } from "@/lib/datetime";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireViewPage("manage:members");
  const { id } = await params;
  const detail = await getSessionDetail(id);
  if (!detail) notFound();
  if (!canViewClub(session, "manage:members", detail.session.clubId)) redirect("/admin/attendance");
  const canManageClub = canManage(session, "manage:members", detail.session.clubId);

  const { session: s, present, absent } = detail;
  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Attendance · {istNumericDate(s.openedAt)}</div>
          <h1 style={{ margin: "6px 0 0" }}>{s.title}</h1>
        </div>
        {s.status === "open" ? (
          canManageClub ? (
            <div style={{ display: "flex", gap: 8 }}>
              <Link href={`/admin/attendance/scan`} className="btn btn-primary">Scan</Link>
              <form action={closeSessionAction}><input type="hidden" name="id" value={s.id} />
                <button className="btn" style={{ color: "var(--rust)", borderColor: "var(--rust)" }}>Close</button>
              </form>
            </div>
          ) : <span className="abadge abadge-approved">Open · live</span>
        ) : <span className="abadge abadge-approved">Closed</span>}
      </div>

      <LiveSession sessionId={s.id} initial={{ open: s.status === "open", count: present.length, present: present.map((p) => ({ memberId: p.memberId, name: p.name })) }} />

      <h2 style={{ font: "400 18px var(--serif)", margin: "28px 0 8px" }}>Absent ({absent.length})</h2>
      {absent.length === 0 ? <p className="body-text" style={{ color: "var(--ink-3)" }}>Everyone&apos;s in.</p> : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 4 }}>
          {absent.map((a) => <li key={a.memberId} className="rule" style={{ paddingBottom: 6, color: "var(--ink-2)" }}>{a.name}</li>)}
        </ul>
      )}
    </div>
  );
}
