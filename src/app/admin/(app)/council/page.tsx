import Link from "next/link";
import { redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, canView } from "@/lib/auth/capabilities";
import { rosterWithPercent, listSessions } from "@/lib/admin/attendance-council";
import { pctOfStrength } from "@/lib/admin/attendance-analytics";
import { CouncilCreateSessionForm } from "@/components/admin/CouncilCreateSessionForm";
import { CouncilRoster } from "@/components/admin/CouncilRoster";
import { istNumericDate } from "@/lib/datetime";

export default async function CouncilDashboard() {
  const session = await requireViewPage("manage:council");
  if (!canView(session, "manage:council")) redirect("/admin");
  const canEdit = canManage(session, "manage:council");

  const [roster, sessions] = await Promise.all([rosterWithPercent(), listSessions()]);
  const strength = roster.length;

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div><div className="eyebrow">Council</div><h1 style={{ margin: "6px 0 0" }}>Dashboard</h1></div>
        <Link href="/admin/council/members" className="btn">{canEdit ? "Manage members" : "View members"}</Link>
      </div>

      <section style={{ marginTop: 20 }}>
        {canEdit ? (
          <CouncilCreateSessionForm />
        ) : (
          <p className="body-text" style={{ color: "var(--ink-3)" }}>Only the president, VP, or tech head can create meetings.</p>
        )}
      </section>

      <h2 style={{ font: "400 18px var(--serif)", margin: "28px 0 8px" }}>Roster attendance</h2>
      <CouncilRoster rows={roster} />

      <h2 style={{ font: "400 18px var(--serif)", margin: "28px 0 8px" }}>Meeting history</h2>
      {sessions.length === 0 ? <p className="body-text" style={{ color: "var(--ink-3)" }}>No meetings yet.</p> : (
        <div className="tablewrap">
          <table className="admin">
            <thead><tr><th>Meeting</th><th>Date</th><th>Slot</th><th>Status</th><th>Present</th><th>% strength</th><th></th></tr></thead>
            <tbody>{sessions.map((s) => (
              <tr key={s.id}>
                <td style={{ fontWeight: 500 }}>{s.title}</td>
                <td>{istNumericDate(s.sessionDate ?? s.openedAt)}</td>
                <td>{s.startTime && s.endTime ? `${s.startTime.slice(0, 5)}–${s.endTime.slice(0, 5)}` : "—"}</td>
                <td><span className={`abadge${s.status === "closed" ? "" : " abadge-approved"}`}>{s.status === "closed" ? "Closed" : "Open"}</span></td>
                <td>{s.presentCount}</td>
                <td>{pctOfStrength(s.presentCount, strength)}%</td>
                <td><Link href={`/admin/council/sessions/${s.id}`} className="btn btn-sm">Open</Link></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
