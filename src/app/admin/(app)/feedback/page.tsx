import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { listPeriods } from "@/lib/admin/feedback";
import { istNumericDate } from "@/lib/datetime";
import { openFeedbackAction, closeFeedbackAction } from "./actions";

export default async function AdminFeedbackPage() {
  await requireViewPage("view:feedback");
  const periods = await listPeriods();
  const open = periods.find((p) => p.closedAt == null) ?? null;

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Students</div>
          <h1 style={{ margin: "6px 0 0" }}>Feedback</h1>
        </div>
        <form action={open ? closeFeedbackAction : openFeedbackAction}>
          <button type="submit" className={open ? "btn btn-ghost" : "btn"}>
            {open ? "Close feedback" : "Open feedback"}
          </button>
        </form>
      </div>

      <p className="label" style={{ marginTop: 10, color: "var(--ink-2)" }}>
        {open
          ? `Open since ${istNumericDate(open.openedAt)} · ${open.responses} responses`
          : "Closed. Students see a “check back soon” page and the site menu hides the link."}
      </p>

      {periods.length === 0 ? (
        <div className="cal-empty" style={{ marginTop: 18 }}>
          Feedback has never been opened.
        </div>
      ) : (
        <div className="tablewrap" style={{ marginTop: 18 }}>
          <table className="admin">
            <thead>
              <tr>
                <th>Period</th>
                <th>Responses</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/admin/feedback/${p.id}`}>
                      {istNumericDate(p.openedAt)} –{" "}
                      {p.closedAt ? istNumericDate(p.closedAt) : "present"}
                    </Link>
                  </td>
                  <td>{p.responses}</td>
                  <td>
                    <span
                      className="label"
                      style={{ color: p.closedAt ? "var(--ink-3)" : "var(--rust)" }}
                    >
                      {p.closedAt ? "Closed" : "● Open"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
