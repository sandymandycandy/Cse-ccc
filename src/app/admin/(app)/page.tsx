import Link from "next/link";
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
  // The feedback control posts to a server action rather than navigating, so it
  // sits beside the link actions instead of among them.
  const hasActions = actions.length > 0 || reach.canFeedback;

  return (
    <div className="admin-page">
      <div className="eyebrow">Dashboard</div>
      <h1 className="admin-hello">Hello, {session.name.split(" ")[0]}</h1>
      <p className="lead admin-summary">{docketSummary(docket)}</p>

      {docket.length > 0 ? (
        <ul className="docket">
          {docket.map((row) => (
            <li className="docket-row" data-tone={row.tone} key={row.key}>
              <span className="docket-n">{row.count}</span>
              <span className="docket-text">{row.text}</span>
              {row.href && row.cta ? (
                <Link href={row.href} className="btn btn-ghost btn-sm docket-cta">
                  {row.cta}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {hasActions ? (
        <section className="admin-block">
          <h2 className="label">Quick actions</h2>
          <div className="stack">
            {actions.map((a) => (
              <Link
                key={a.key}
                href={a.href}
                className={a.primary ? "btn btn-primary" : "btn btn-ghost"}
              >
                {a.label}
              </Link>
            ))}
            {/* The same two server actions /admin/feedback uses — a second entry
                point, not a second mutation path. */}
            {reach.canFeedback ? (
              <form action={signals.feedbackOpen ? closeFeedbackAction : openFeedbackAction}>
                <button type="submit" className="btn btn-ghost">
                  {signals.feedbackOpen ? "Close feedback" : "Open feedback"}
                </button>
              </form>
            ) : null}
          </div>
        </section>
      ) : null}

      {glance.length > 0 ? (
        <section className="admin-block">
          <h2 className="label">At a glance</h2>
          <div className="admin-stats admin-glance">
            {glance.map((t) => (
              <Link className="admin-stat" href={t.href} key={t.label}>
                <span className="n">{t.n}</span>
                <span className="label">{t.label}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
