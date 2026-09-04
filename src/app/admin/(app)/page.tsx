import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/guards";
import { canView, adminHomePath } from "@/lib/auth/capabilities";
import { getAdminStats } from "@/lib/admin/queries";
import { listPeriods } from "@/lib/admin/feedback";
import { openFeedbackAction, closeFeedbackAction } from "./feedback/actions";

export default async function AdminDashboard() {
  const session = await requireAdminPage();

  // Login always lands on /admin. This page is entirely events — stats, pending
  // approvals, "Create event" — so a role with no events reach is sent to the one
  // surface it does hold instead of an empty page.
  const home = adminHomePath(session.role);
  if (home !== "/admin") redirect(home);

  const stats = await getAdminStats(session);
  const canApprove = canView(session, "approve:events");

  // One click from the dashboard to start or stop a collection window, for the
  // three roles that hold the capability. Reuses the same two server actions as
  // /admin/feedback — a second entry point, not a second mutation path.
  const canFeedback = canView(session, "view:feedback");
  const openFeedback = canFeedback
    ? ((await listPeriods()).find((p) => p.closedAt == null) ?? null)
    : null;

  const tiles: { n: number; label: string }[] = [
    { n: stats.pending, label: "Pending approval" },
    { n: stats.upcoming, label: "Upcoming events" },
    { n: stats.events, label: session.clubId ? "Your club's events" : "All events" },
  ];

  return (
    <div className="admin-page">
      <div className="eyebrow">Dashboard</div>
      <h1 style={{ margin: "8px 0 0" }}>Hello, {session.name.split(" ")[0]}</h1>
      <p className="lead" style={{ marginTop: 8 }}>
        {canApprove
          ? "Review what's waiting and keep the calendar moving."
          : "Draft an event and send it for approval."}
      </p>

      <div className="admin-stats">
        {tiles.map((t) => (
          <div className="admin-stat" key={t.label}>
            <div className="n">{t.n}</div>
            <div className="label">{t.label}</div>
          </div>
        ))}
      </div>

      <div className="stack" style={{ gap: 12, marginTop: 24 }}>
        <Link href="/admin/events/new" className="btn btn-primary">
          Create event
        </Link>
        {canApprove ? (
          <Link href="/admin/events/approvals" className="btn btn-ghost">
            Review approvals{stats.pending > 0 ? ` (${stats.pending})` : ""}
          </Link>
        ) : null}
        {canFeedback ? (
          <form action={openFeedback ? closeFeedbackAction : openFeedbackAction}>
            <button type="submit" className="btn btn-ghost">
              {openFeedback
                ? `Close feedback (${openFeedback.responses})`
                : "Open feedback"}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
