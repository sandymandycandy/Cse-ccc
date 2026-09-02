import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { resolveAttendanceScope } from "@/lib/admin/attendance-scope";
import { rosterWithPercent, listSessions, membershipCounts } from "@/lib/admin/attendance-club";
import { computeClubAnalytics } from "@/lib/admin/attendance-analytics";
import { AttendanceAnalytics } from "@/components/admin/AttendanceAnalytics";
import { AttendanceRoster } from "@/components/admin/AttendanceRoster";

const WATCHLIST_THRESHOLDS = [50, 60, 75, 85];

/**
 * Everything about a club's attendance that is for READING: the headline rates,
 * the most/least attended sessions, the low-attendance watchlist and the
 * per-member roster. Split off the dashboard, which is for creating sessions.
 */
export default async function AttendanceAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ club?: string; below?: string }>;
}) {
  const session = await requireViewPage("manage:members");
  const { club, below } = await searchParams;
  const belowThreshold = WATCHLIST_THRESHOLDS.includes(Number(below)) ? Number(below) : 75;
  const { clubId, clubs, councilWide } = await resolveAttendanceScope(session, club);

  if (clubId == null) {
    return <div className="admin-page"><h1>Attendance analytics</h1><p className="lead">No club to show.</p></div>;
  }
  const clubQuery = councilWide ? `?club=${clubId}` : "";
  const clubName = clubs.find((c) => c.id === clubId)?.name ?? null;

  const [roster, sessions, membership] = await Promise.all([
    rosterWithPercent(clubId),
    listSessions(clubId),
    membershipCounts(clubId),
  ]);
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
      <Link href={`/admin/attendance${clubQuery}`} className="label" style={{ color: "var(--forest)" }}>
        ← Attendance
      </Link>
      <div className="admin-page-head" style={{ marginTop: 14 }}>
        <div>
          <div className="eyebrow">Attendance</div>
          <h1 style={{ margin: "6px 0 0" }}>Analytics</h1>
          {clubName ? <p className="body-text" style={{ marginTop: 6 }}>{clubName}</p> : null}
        </div>
        <a href={`/api/admin/attendance/export?club=${clubId}`} className="btn">Export attendance (CSV)</a>
      </div>

      {/* The club picker has to be here too: this page is reached with ?club= and
          the threshold form below re-submits to it, so switching club from the
          dashboard alone would strand the reader on the wrong club's numbers. */}
      {councilWide && clubs.length > 0 ? (
        <form method="get" style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select name="club" defaultValue={clubId} className="select-input" style={{ maxWidth: 260 }}>
            {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn btn-sm">View</button>
        </form>
      ) : null}

      <AttendanceAnalytics analytics={analytics} clubParam={councilWide ? clubId : null} />

      <h2 style={{ font: "400 18px var(--serif)", margin: "28px 0 8px" }}>Roster attendance</h2>
      <AttendanceRoster rows={roster} />
    </div>
  );
}
