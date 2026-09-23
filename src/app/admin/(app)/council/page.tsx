import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, canView } from "@/lib/auth/capabilities";
import { rosterWithPercent, listSessions } from "@/lib/admin/attendance-council";
import { CouncilCreateSessionForm } from "@/components/admin/CouncilCreateSessionForm";
import { SessionHistory } from "@/components/admin/SessionHistory";
import { renameCouncilSessionAction } from "./actions";

/**
 * The council dashboard is the "hold a meeting" surface: create a meeting, then
 * look back over what has been held. Analytics and the roster live on their own
 * page, matching the club attendance dashboard.
 */
export default async function CouncilDashboard() {
  const session = await requireViewPage("manage:council");
  if (!canView(session, "manage:council")) redirect("/admin");
  const canEdit = canManage(session, "manage:council");

  const [roster, sessions] = await Promise.all([rosterWithPercent(), listSessions()]);
  const strength = roster.length;


  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div><div className="eyebrow">People</div><h1 style={{ margin: "8px 0 0" }}>Council</h1></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/admin/council/analytics" className="btn btn-primary">Analytics</Link>
          <a href="/api/admin/council/export" className="btn">Export attendance (CSV)</a>
          <Link href="/admin/council/members" className="btn">{canEdit ? "Manage members" : "View members"}</Link>
        </div>
      </div>

      <p className="admin-lead">Organize council meetings and review attendance across the team.</p>
      {/* Creating a meeting is what this page is for, so it leads. */}
      <section className="admin-section-panel" aria-labelledby="new-council-meeting">
        <div className="admin-section-panel-head">
          <div><span className="dashboard-kicker">Take the register</span><h2 id="new-council-meeting">New meeting</h2></div>
          <Plus size={21} aria-hidden="true" />
        </div>
        <div className="admin-section-panel-body">
        {canEdit ? (
          <CouncilCreateSessionForm />
        ) : (
          <p className="body-text" style={{ color: "var(--ink-3)" }}>Only the president, VP, or tech head can create meetings.</p>
        )}
        </div>
      </section>

      <h2 style={{ font: "400 18px var(--serif)", margin: "32px 0 8px" }}>Meeting history</h2>
      <SessionHistory sessions={sessions} strength={strength} scope="council" onRename={canEdit ? renameCouncilSessionAction : undefined} />
    </div>
  );
}
