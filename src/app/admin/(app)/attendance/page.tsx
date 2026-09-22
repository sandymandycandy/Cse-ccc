import Link from "next/link";
import { Plus } from "lucide-react";
import { requireViewPage } from "@/lib/auth/guards";
import { grantFor } from "@/lib/auth/capabilities";
import { resolveAttendanceScope } from "@/lib/admin/attendance-scope";
import { rosterWithPercent, listSessions } from "@/lib/admin/attendance-club";
import { averageTurnout } from "@/lib/admin/attendance-analytics";
import { CreateSessionForm } from "@/components/admin/CreateSessionForm";
import { SessionHistory } from "@/components/admin/SessionHistory";
import { ClubPicker } from "@/components/admin/ClubPicker";

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
    return (
      <div className="admin-page">
        <div className="eyebrow">People</div>
        <h1 className="att-title">Attendance</h1>
        <div className="table-empty att-empty">
          <h2>No club to show</h2>
          <p>You are not attached to a club yet, so there is no roster to take.</p>
        </div>
      </div>
    );
  }
  const grant = grantFor(session.role, "manage:members");
  const clubQuery = councilWide ? `?club=${clubId}` : "";

  const [roster, sessions] = await Promise.all([
    rosterWithPercent(clubId),
    listSessions(clubId),
  ]);
  const strength = roster.length;
  const openCount = sessions.filter((s) => s.status === "open").length;

  return (
    <div className="admin-page att-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">People</div>
          <h1 className="att-title">Attendance</h1>
        </div>
        <div className="att-head-actions">
          <Link href={`/admin/attendance/analytics${clubQuery}`} className="btn btn-primary">
            Analytics
          </Link>
          <Link href={`/admin/attendance/members${clubQuery}`} className="btn btn-ghost">
            {canManageClub ? "Manage members" : "View members"}
          </Link>
          <a href={`/api/admin/attendance/export?club=${clubId}`} className="btn btn-ghost">
            Export CSV
          </a>
        </div>
      </div>
      <p className="admin-lead">
        Open a session to take the register, then look back over what the club has
        already held.
      </p>

      <ClubPicker clubs={clubs} clubId={clubId} show={councilWide} />

      <div className="admin-stats att-tiles">
        <div className="admin-stat">
          <span className="n">{strength}</span>
          <span className="label">On the roster</span>
        </div>
        <div className="admin-stat">
          <span className="n">{sessions.length}</span>
          <span className="label">Sessions held</span>
          {openCount > 0 ? (
            <span className="hint">{openCount} still open</span>
          ) : null}
        </div>
        <div className="admin-stat">
          <span className="n">{averageTurnout(sessions, strength)}%</span>
          <span className="label">Average turnout</span>
          <span className="hint">Against today&rsquo;s strength</span>
        </div>
      </div>

      {/* Creating a session is what this page is for, so it leads. */}
      <section className="att-panel" aria-labelledby="new-session-title">
        <div className="att-panel-head">
          <div>
            <span className="dashboard-kicker">Take the register</span>
            <h2 id="new-session-title">New session</h2>
          </div>
          <Plus size={21} aria-hidden="true" />
        </div>
        {canManageClub ? (
          <CreateSessionForm clubId={grant === "all" ? clubId : null} />
        ) : (
          <p className="body-text att-muted">Only club heads can create sessions.</p>
        )}
      </section>

      <h2 className="att-section-title">Session history</h2>
      <SessionHistory sessions={sessions} strength={strength} />
    </div>
  );
}
