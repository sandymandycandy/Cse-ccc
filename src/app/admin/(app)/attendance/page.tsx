import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, canViewClub, grantFor } from "@/lib/auth/capabilities";
import { listClubsBrief } from "@/lib/admin/clubs";
import { rosterWithPercent, listSessions, membershipCounts } from "@/lib/admin/attendance-club";
import { computeClubAnalytics, pctOfStrength } from "@/lib/admin/attendance-analytics";
import { AttendanceAnalytics } from "@/components/admin/AttendanceAnalytics";
import { AttendanceRoster } from "@/components/admin/AttendanceRoster";
import { CreateSessionForm } from "@/components/admin/CreateSessionForm";
import { istNumericDate } from "@/lib/datetime";

const WATCHLIST_THRESHOLDS = [50, 60, 75, 85];

export default async function AttendanceDashboard({ searchParams }: { searchParams: Promise<{ club?: string; below?: string }> }) {
  const session = await requireViewPage("manage:members");
  const { club, below } = await searchParams;
  const belowThreshold = WATCHLIST_THRESHOLDS.includes(Number(below)) ? Number(below) : 75;
  const grant = grantFor(session.role, "manage:members");
  // Council-wide grants (all managers, faculty read-only) can view every club and
  // need a club picker; own-scoped heads are pinned to their own club.
  const councilWide = grant === "all" || grant === "read";
  const clubs = councilWide ? await listClubsBrief() : [];
  const clubId = grant === "own" ? session.clubId : (club ?? (clubs[0]?.id ?? null));

  if (clubId == null || !canViewClub(session, "manage:members", clubId)) {
    return <div className="admin-page"><h1>Attendance</h1><p className="lead">No club to show.</p></div>;
  }
  const canManageClub = canManage(session, "manage:members", clubId);

  const [roster, sessions, membership] = await Promise.all([
    rosterWithPercent(clubId), listSessions(clubId), membershipCounts(clubId),
  ]);
  const strength = roster.length;
  const analytics = computeClubAnalytics({
    membership,
    roster,
    sessions: sessions.map((s) => ({
      id: s.id, title: s.title, status: s.status, presentCount: s.presentCount,
      date: (s.sessionDate ?? s.openedAt).slice(0, 10),
    })),
    belowThreshold,
  });

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div><div className="eyebrow">Attendance</div><h1 style={{ margin: "6px 0 0" }}>Dashboard</h1></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a href={`/api/admin/attendance/export?club=${clubId}`} className="btn">Export attendance (CSV)</a>
          <Link href={`/admin/attendance/members${councilWide ? `?club=${clubId}` : ""}`} className="btn">{canManageClub ? "Manage members" : "View members"}</Link>
        </div>
      </div>

      {councilWide && clubs.length > 0 ? (
        <form method="get" style={{ marginTop: 12 }}>
          <select name="club" defaultValue={clubId} style={{ maxWidth: 260 }}>
            {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn btn-sm" style={{ marginLeft: 8 }}>View</button>
        </form>
      ) : null}

      <section style={{ marginTop: 20 }}>
        {canManageClub ? (
          <CreateSessionForm clubId={grant === "all" ? clubId : null} />
        ) : (
          <p className="body-text" style={{ color: "var(--ink-3)" }}>Only club heads can create sessions.</p>
        )}
      </section>

      <AttendanceAnalytics analytics={analytics} clubParam={councilWide ? clubId : null} />

      <h2 style={{ font: "400 18px var(--serif)", margin: "28px 0 8px" }}>Session history</h2>
      {sessions.length === 0 ? <p className="body-text" style={{ color: "var(--ink-3)" }}>No sessions yet.</p> : (
        <div className="tablewrap">
          <table className="admin">
            <thead><tr><th>Session</th><th>Date</th><th>Slot</th><th>Status</th><th>Present</th><th>% strength</th><th></th></tr></thead>
            <tbody>{sessions.map((s) => (
              <tr key={s.id}>
                <td style={{ fontWeight: 500 }}>{s.title}</td>
                <td>{istNumericDate(s.sessionDate ?? s.openedAt)}</td>
                <td>{s.startTime && s.endTime ? `${s.startTime.slice(0, 5)}–${s.endTime.slice(0, 5)}` : "—"}</td>
                <td><span className={`abadge${s.status === "closed" ? "" : " abadge-approved"}`}>{s.status === "closed" ? "Closed" : "Open"}</span></td>
                <td>{s.presentCount}</td>
                <td>{pctOfStrength(s.presentCount, strength)}%</td>
                <td><Link href={`/admin/attendance/sessions/${s.id}`} className="btn btn-sm">Open</Link></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <h2 style={{ font: "400 18px var(--serif)", margin: "28px 0 8px" }}>Roster attendance</h2>
      <AttendanceRoster rows={roster} />
    </div>
  );
}
