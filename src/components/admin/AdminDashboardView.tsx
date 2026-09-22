import Link from "next/link";
import { ArrowRight, ArrowUpRight, CheckCheck, CircleCheck, Plus } from "lucide-react";
import type { ReactNode } from "react";
import type { DocketItem, GlanceTile, QuickAction } from "@/lib/admin/dashboard";
import { AdminIcon } from "./AdminIcon";

export function AdminDashboardView({ name, summary, docket, glance, actions, feedbackControl }: {
  name: string;
  summary: string;
  docket: DocketItem[];
  glance: GlanceTile[];
  actions: QuickAction[];
  feedbackControl?: ReactNode;
}) {
  const hasActions = actions.length > 0 || !!feedbackControl;
  return (
    <div className="admin-page admin-dashboard">
      <div className="dashboard-welcome">
        <div>
          <div className="eyebrow">Your overview</div>
          <h1 className="admin-hello">Hello, {name.split(" ")[0]}<span className="dashboard-hello-dot">.</span></h1>
          <p className="lead admin-summary">{summary}</p>
        </div>
        <span className="dashboard-context"><span aria-hidden="true" /> CSE Club Council</span>
      </div>

      <div className="dashboard-columns" data-actions={hasActions}>
        <section className="dashboard-panel" aria-labelledby="attention-title">
          <div className="dashboard-panel-head">
            <div><span className="dashboard-kicker">Your next steps</span><h2 id="attention-title">Attention centre</h2></div>
            <CheckCheck size={21} aria-hidden="true" />
          </div>
          {docket.length > 0 ? (
            <ul className="docket">
              {docket.map((row) => (
                <li className="docket-row" data-tone={row.tone} key={row.key}>
                  <span className="docket-n">{row.count}</span>
                  <div className="docket-copy"><span className="docket-text">{row.text}</span><span className="docket-state">{row.tone === "wait" ? "Awaiting review" : "Ready for you"}</span></div>
                  {row.href && row.cta ? <Link href={row.href} className="btn btn-ghost btn-sm docket-cta">{row.cta}<ArrowRight size={14} aria-hidden="true" /></Link> : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="dashboard-clear"><span><CircleCheck size={26} aria-hidden="true" /></span><h3>You’re all caught up</h3><p>Approvals and messages that need your attention will appear here.</p></div>
          )}
        </section>

        {hasActions ? <section className="dashboard-panel dashboard-actions" aria-labelledby="quick-actions-title">
          <div className="dashboard-panel-head"><div><span className="dashboard-kicker">Make things happen</span><h2 id="quick-actions-title">Quick actions</h2></div><Plus size={21} aria-hidden="true" /></div>
          <div className="dashboard-action-list">
            {actions.map((action) => <Link key={action.key} href={action.href} className="dashboard-action" data-primary={action.primary}>
              <span className="dashboard-action-icon"><AdminIcon href={action.key === "event" ? "/admin/events" : "/admin/announcements"} size={20} /></span>
              <span><strong>{action.label}</strong><small>{action.key === "event" ? "Plan what’s next for your club" : "Share an update with students"}</small></span>
              <ArrowUpRight size={17} aria-hidden="true" />
            </Link>)}
            {feedbackControl ? <div className="dashboard-feedback">{feedbackControl}<p>Control when students can submit feedback.</p></div> : null}
          </div>
        </section> : null}
      </div>

      {glance.length > 0 ? <section className="dashboard-glance" aria-labelledby="glance-title">
        <div className="dashboard-section-head"><h2 id="glance-title">At a glance</h2><span>Your programme in numbers</span></div>
        <div className="admin-stats admin-glance">
          {glance.map((tile) => <Link className="admin-stat" href={tile.href} key={tile.label}>
            <div className="dashboard-stat-top"><AdminIcon href={tile.href} /><ArrowUpRight size={16} aria-hidden="true" /></div>
            <span className="n">{tile.n}</span><span className="label">{tile.label}</span>
          </Link>)}
        </div>
      </section> : null}
    </div>
  );
}
