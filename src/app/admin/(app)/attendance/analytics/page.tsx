import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { resolveAttendanceScope } from "@/lib/admin/attendance-scope";
import { rosterWithPercent, listSessions, membershipCounts } from "@/lib/admin/attendance-club";
import { computeClubAnalytics } from "@/lib/admin/attendance-analytics";
import { AttendanceAnalytics } from "@/components/admin/AttendanceAnalytics";
import { AttendanceRoster } from "@/components/admin/AttendanceRoster";
import { ClubPicker } from "@/components/admin/ClubPicker";

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
    return (
      <div className="admin-page">
        <div className="eyebrow">People</div>
        <h1 className="att-title">Attendance analytics</h1>
        <div className="table-empty att-empty">
          <h2>No club to show</h2>
          <p>You are not attached to a club yet, so there are no numbers to read.</p>
        </div>
      </div>
    );
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
    <div className="admin-page att-page">
      <Link href={`/admin/attendance${clubQuery}`} className="admin-back">
        ← Attendance
      </Link>
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Attendance</div>
          <h1 className="att-title">Analytics</h1>
        </div>
        <a href={`/api/admin/attendance/export?club=${clubId}`} className="btn btn-ghost">
          Export CSV
        </a>
      </div>
      {clubName ? <p className="admin-lead">{clubName}</p> : null}

      {/* The club picker has to be here too: this page is reached with ?club= and
          the threshold form below re-submits to it, so switching club from the
          dashboard alone would strand the reader on the wrong club's numbers.
          The threshold rides along so changing club does not reset it. */}
      <ClubPicker
        clubs={clubs}
        clubId={clubId}
        show={councilWide}
        hidden={{ below: String(belowThreshold) }}
      />

      <AttendanceAnalytics analytics={analytics} clubParam={councilWide ? clubId : null} />

      <h2 className="att-section-title">Roster attendance</h2>
      <AttendanceRoster rows={roster} />
    </div>
  );
}
