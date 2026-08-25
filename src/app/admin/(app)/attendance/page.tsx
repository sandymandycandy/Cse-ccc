import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, canViewClub, grantFor } from "@/lib/auth/capabilities";
import { listClubsBrief } from "@/lib/admin/clubs";
import { rosterWithPercent, listSessions, getOpenSession } from "@/lib/admin/attendance-club";
import { OpenSessionForm } from "@/components/admin/OpenSessionForm";
import { istNumericDate } from "@/lib/datetime";

export default async function AttendanceDashboard({ searchParams }: { searchParams: Promise<{ club?: string }> }) {
  const session = await requireViewPage("manage:members");
  const { club } = await searchParams;
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

  const [roster, sessions, open] = await Promise.all([
    rosterWithPercent(clubId), listSessions(clubId), getOpenSession(clubId),
  ]);

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div><div className="eyebrow">Attendance</div><h1 style={{ margin: "6px 0 0" }}>Dashboard</h1></div>
        <Link href={`/admin/attendance/members${councilWide ? `?club=${clubId}` : ""}`} className="btn">{canManageClub ? "Manage members" : "View members"}</Link>
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
        {open ? (
          <div className="note">
            Session open: <strong>{open.title}</strong> · {open.presentCount} present.{" "}
            <Link href={`/admin/attendance/sessions/${open.id}`} style={{ color: "var(--forest)" }}>Open live view →</Link>
          </div>
        ) : canManageClub ? (
          <OpenSessionForm clubId={grant === "all" ? clubId : null} />
        ) : (
          <p className="body-text" style={{ color: "var(--ink-3)" }}>No open session.</p>
        )}
      </section>

      <h2 style={{ font: "400 18px var(--serif)", margin: "28px 0 8px" }}>Roster attendance</h2>
      {roster.length === 0 ? <p className="body-text" style={{ color: "var(--ink-3)" }}>No active members yet.</p> : (
        <div className="tablewrap">
          <table className="admin">
            <thead><tr><th>Member</th><th>Attended</th><th>Eligible</th><th>%</th></tr></thead>
            <tbody>{roster.map((r) => (
              <tr key={r.memberId}><td style={{ fontWeight: 500 }}>{r.name}</td><td>{r.attended}</td><td>{r.eligible}</td><td>{r.pct}%</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <h2 style={{ font: "400 18px var(--serif)", margin: "28px 0 8px" }}>Session history</h2>
      {sessions.length === 0 ? <p className="body-text" style={{ color: "var(--ink-3)" }}>No sessions yet.</p> : (
        <div className="tablewrap">
          <table className="admin">
            <thead><tr><th>Title</th><th>When</th><th>Status</th><th>Present</th></tr></thead>
            <tbody>{sessions.map((s) => (
              <tr key={s.id}><td><Link href={`/admin/attendance/sessions/${s.id}`} style={{ color: "var(--forest)" }}>{s.title}</Link></td>
                <td>{istNumericDate(s.openedAt)}</td><td>{s.status}</td><td>{s.presentCount}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
