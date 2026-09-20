import Link from "next/link";
import { redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, canView } from "@/lib/auth/capabilities";
import { rosterWithPercent, listSessions } from "@/lib/admin/attendance-council";
import { pctOfStrength } from "@/lib/admin/attendance-analytics";
import { CouncilCreateSessionForm } from "@/components/admin/CouncilCreateSessionForm";
import { istNumericDate } from "@/lib/datetime";
import { AdminTable, type AdminTableRow } from "@/components/admin/AdminTable";
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

  const historyRows: AdminTableRow[] = sessions.map((s) => {
    const status = s.status === "closed" ? "Closed" : "Open";
    const date = istNumericDate(s.sessionDate ?? s.openedAt);
    const slot =
      s.startTime && s.endTime ? `${s.startTime.slice(0, 5)}–${s.endTime.slice(0, 5)}` : "—";
    return {
      key: s.id,
      status,
      ...(canEdit ? { rename: s.title } : {}),
      values: [s.title, date, slot, status],
      cells: [
        s.title,
        date,
        slot,
        <span key="st" className={`abadge${s.status === "closed" ? "" : " abadge-approved"}`}>
          {status}
        </span>,
        s.presentCount,
        `${pctOfStrength(s.presentCount, strength)}%`,
        <Link key="o" href={`/admin/council/sessions/${s.id}`} className="btn btn-sm">
          Open
        </Link>,
      ],
    };
  });

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div><div className="eyebrow">Council</div><h1 style={{ margin: "8px 0 0" }}>Dashboard</h1></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/admin/council/analytics" className="btn btn-primary">Analytics</Link>
          <a href="/api/admin/council/export" className="btn">Export attendance (CSV)</a>
          <Link href="/admin/council/members" className="btn">{canEdit ? "Manage members" : "View members"}</Link>
        </div>
      </div>

      {/* Creating a meeting is what this page is for, so it leads. */}
      <section style={{ marginTop: 20 }}>
        {canEdit ? (
          <CouncilCreateSessionForm />
        ) : (
          <p className="body-text" style={{ color: "var(--ink-3)" }}>Only the president, VP, or tech head can create meetings.</p>
        )}
      </section>

      <h2 style={{ font: "400 18px var(--serif)", margin: "32px 0 8px" }}>Meeting history</h2>
      {sessions.length === 0 ? (
        <p className="body-text" style={{ color: "var(--ink-3)" }}>No meetings yet.</p>
      ) : (
        <AdminTable
          heading="Meeting history"
          noun="meeting"
          columns={[
            { label: "Meeting" },
            { label: "Date" },
            { label: "Slot" },
            { label: "Status" },
            { label: "Present" },
            { label: "% strength" },
            { label: "Open" },
          ]}
          rows={historyRows}
          onRename={canEdit ? renameCouncilSessionAction : undefined}
        />
      )}
    </div>
  );
}
