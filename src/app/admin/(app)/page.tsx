import { AdminDashboardView } from "@/components/admin/AdminDashboardView";
import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/guards";
import { adminHomePath } from "@/lib/auth/capabilities";
import {
  getDashboardSignals,
  reachOf,
  buildDocket,
  glanceTiles,
  docketSummary,
  quickActions,
} from "@/lib/admin/dashboard";
import { openFeedbackAction, closeFeedbackAction } from "./feedback/actions";

export default async function AdminDashboard() {
  const session = await requireAdminPage();

  // Login always lands on /admin, so a role with nothing to show here is sent
  // to the one surface it does hold instead of an empty page.
  const home = adminHomePath(session.role);
  if (home !== "/admin") redirect(home);

  const signals = await getDashboardSignals(session);
  const reach = reachOf(session);
  const docket = buildDocket(signals, reach);
  const glance = glanceTiles(signals, reach);
  const actions = quickActions(reach);
  return (
    <AdminDashboardView
      name={session.name}
      summary={docketSummary(docket)}
      docket={docket}
      glance={glance}
      actions={actions}
      feedbackControl={reach.canFeedback ? (
        <form action={signals.feedbackOpen ? closeFeedbackAction : openFeedbackAction}>
          <button type="submit" className="btn btn-ghost">
            {signals.feedbackOpen ? "Close feedback" : "Open feedback"}
          </button>
        </form>
      ) : undefined}
    />
  );
}
