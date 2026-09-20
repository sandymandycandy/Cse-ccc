import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { listPeriods, listLeaderChoices } from "@/lib/admin/feedback";
import { FeedbackLeaderPicker } from "@/components/admin/FeedbackLeaderPicker";
import { istNumericDate } from "@/lib/datetime";
import { openFeedbackAction, closeFeedbackAction } from "./actions";
import { AdminTable, type AdminTableRow } from "@/components/admin/AdminTable";

export default async function AdminFeedbackPage() {
  await requireViewPage("view:feedback");
  const [periods, choices] = await Promise.all([listPeriods(), listLeaderChoices()]);
  const open = periods.find((p) => p.closedAt == null) ?? null;

  const periodRows: AdminTableRow[] = periods.map((p) => {
    const span = `${istNumericDate(p.openedAt)} – ${
      p.closedAt ? istNumericDate(p.closedAt) : "present"
    }`;
    const status = p.closedAt ? "Closed" : "Open";
    return {
      key: p.id,
      status,
      // No `rename`: a period is a span of dates, not something with a name.
      values: [span, p.responses, status],
      cells: [
        <Link key="p" href={`/admin/feedback/${p.id}`}>
          {span}
        </Link>,
        p.responses,
        <span key="s" className="label" style={{ color: p.closedAt ? "var(--ink-3)" : "var(--rust)" }}>
          {p.closedAt ? "Closed" : "● Open"}
        </span>,
      ],
    };
  });

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Students</div>
          <h1 style={{ margin: "8px 0 0" }}>Feedback</h1>
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
        <AdminTable
          heading="Feedback periods"
          noun="period"
          columns={[{ label: "Period" }, { label: "Responses" }, { label: "Status" }]}
          rows={periodRows}
        />
      )}

      <h2 style={{ marginTop: 36 }}>Who the form names</h2>
      <p className="label" style={{ marginTop: 6, color: "var(--ink-2)" }}>
        A club with more than one head account on file names nobody until you
        choose here.
      </p>
      <FeedbackLeaderPicker clubs={choices} />
    </div>
  );
}
