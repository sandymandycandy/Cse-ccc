import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { grantFor } from "@/lib/auth/capabilities";
import { resolveAttendanceScope } from "@/lib/admin/attendance-scope";
import { rosterWithPercent, listSessions } from "@/lib/admin/attendance-club";
import { pctOfStrength } from "@/lib/admin/attendance-analytics";
import { CreateSessionForm } from "@/components/admin/CreateSessionForm";
import { istNumericDate } from "@/lib/datetime";

/**
 * The attendance dashboard is the "run a session" surface: pick a club, create
 * a session, then look back over what has already been held. Analytics and the
 * per-member roster live on their own page — they are for reading, not doing,
 * and kept this page from getting to the point.
 */
export default async function AttendanceDashboard({
  searchParams,
}: {
  searchParams: Promise<{ club?: string }>;
}) {
  const session = await requireViewPage("manage:members");
  const { club } = await searchParams;
  const { clubId, clubs, councilWide, canManageClub } = await resolveAttendanceScope(session, club);

  if (clubId == null) {
    return <div className="admin-page"><h1>Attendance</h1><p className="lead">No club to show.</p></div>;
  }
  const grant = grantFor(session.role, "manage:members");
  const clubQuery = councilWide ? `?club=${clubId}` : "";

  const [roster, sessions] = await Promise.all([
    rosterWithPercent(clubId),
    listSessions(clubId),
  ]);
  const strength = roster.length;

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div><div className="eyebrow">Attendance</div><h1 style={{ margin: "6px 0 0" }}>Dashboard</h1></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href={`/admin/attendance/analytics${clubQuery}`} className="btn btn-primary">Analytics</Link>
          <a href={`/api/admin/attendance/export?club=${clubId}`} className="btn">Export attendance (CSV)</a>
          <Link href={`/admin/attendance/members${clubQuery}`} className="btn">
            {canManageClub ? "Manage members" : "View members"}
          </Link>
        </div>
      </div>

      {councilWide && clubs.length > 0 ? (
        <form method="get" style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select name="club" defaultValue={clubId} className="select-input" style={{ maxWidth: 260 }}>
            {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn btn-sm">View</button>
        </form>
      ) : null}

      {/* Creating a session is what this page is for, so it leads. */}
      <section style={{ marginTop: 20 }}>
        {canManageClub ? (
          <CreateSessionForm clubId={grant === "all" ? clubId : null} />
        ) : (
          <p className="body-text" style={{ color: "var(--ink-3)" }}>Only club heads can create sessions.</p>
        )}
      </section>

      <h2 style={{ font: "400 18px var(--serif)", margin: "32px 0 8px" }}>Session history</h2>
      {sessions.length === 0 ? <p className="body-text" style={{ color: "var(--ink-3)" }}>No sessions yet.</p> : (
        <div className="tablewrap cards">
          <table className="admin">
            <thead><tr><th>Session</th><th>Date</th><th>Slot</th><th>Status</th><th>Present</th><th>% strength</th><th></th></tr></thead>
            <tbody>{sessions.map((s) => (
              <tr key={s.id}>
                <td data-primary="" style={{ fontWeight: 500 }}>{s.title}</td>
                <td data-label="Date">{istNumericDate(s.sessionDate ?? s.openedAt)}</td>
                <td data-label="Slot">{s.startTime && s.endTime ? `${s.startTime.slice(0, 5)}–${s.endTime.slice(0, 5)}` : "—"}</td>
                <td data-label="Status"><span className={`abadge${s.status === "closed" ? "" : " abadge-approved"}`}>{s.status === "closed" ? "Closed" : "Open"}</span></td>
                <td data-label="Present">{s.presentCount}</td>
                <td data-label="% strength">{pctOfStrength(s.presentCount, strength)}%</td>
                <td data-action=""><Link href={`/admin/attendance/sessions/${s.id}`} className="btn btn-sm">Open</Link></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
