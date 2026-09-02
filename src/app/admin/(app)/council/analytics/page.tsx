import Link from "next/link";
import { redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canView } from "@/lib/auth/capabilities";
import { rosterWithPercent, listSessions, membershipCounts } from "@/lib/admin/attendance-council";
import { computeClubAnalytics } from "@/lib/admin/attendance-analytics";
import { AttendanceAnalytics } from "@/components/admin/AttendanceAnalytics";
import { CouncilRoster } from "@/components/admin/CouncilRoster";

const WATCHLIST_THRESHOLDS = [50, 60, 75, 85];

/**
 * The council's reading surface, matching the club one: headline rates, the
 * most/least attended meetings, the low-attendance watchlist and the roster.
 * The analytics computation is shared with clubs — a council meeting and a club
 * session are the same shape, so the numbers are derived the same way rather
 * than by a second, drifting implementation.
 */
export default async function CouncilAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ below?: string }>;
}) {
  const session = await requireViewPage("manage:council");
  if (!canView(session, "manage:council")) redirect("/admin");
  const { below } = await searchParams;
  const belowThreshold = WATCHLIST_THRESHOLDS.includes(Number(below)) ? Number(below) : 75;

  const [roster, sessions, membership] = await Promise.all([
    rosterWithPercent(),
    listSessions(),
    membershipCounts(),
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
      <Link href="/admin/council" className="label" style={{ color: "var(--forest)" }}>
        ← Council
      </Link>
      <div className="admin-page-head" style={{ marginTop: 14 }}>
        <div>
          <div className="eyebrow">Council</div>
          <h1 style={{ margin: "6px 0 0" }}>Analytics</h1>
        </div>
        <a href="/api/admin/council/export" className="btn">Export attendance (CSV)</a>
      </div>

      {/* clubParam is null: the council is org-wide, so there is no club to
          preserve in the watchlist threshold form. */}
      <AttendanceAnalytics analytics={analytics} clubParam={null} />

      <h2 style={{ font: "400 18px var(--serif)", margin: "28px 0 8px" }}>Roster attendance</h2>
      <CouncilRoster rows={roster} />
    </div>
  );
}
