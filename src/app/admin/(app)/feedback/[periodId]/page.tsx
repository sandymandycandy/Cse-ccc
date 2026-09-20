import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { listPeriods, listResponses, clubNames } from "@/lib/admin/feedback";
import { summariseByClub } from "@/lib/feedback/summary";
import { istNumericDate } from "@/lib/datetime";
import { AdminTable, type AdminTableRow } from "@/components/admin/AdminTable";

const fmt = (n: number | null) => (n == null ? "—" : n.toFixed(1));

export default async function FeedbackPeriodPage({
  params,
}: {
  params: Promise<{ periodId: string }>;
}) {
  await requireViewPage("view:feedback");
  const { periodId } = await params;

  const [periods, responses, names] = await Promise.all([
    listPeriods(),
    listResponses(periodId),
    clubNames(),
  ]);
  const period = periods.find((p) => p.id === periodId);
  if (!period) notFound();

  const summary = summariseByClub(
    responses.map((r) => ({
      clubId: r.clubId,
      vtu: r.vtu,
      clubRating: r.clubRating,
      headRating: r.headRating,
      viceRating: r.viceRating,
    })),
  ).sort((a, b) => b.responses - a.responses);

  const summaryRows: AdminTableRow[] = summary.map((s) => {
    const club = names.get(s.clubId) ?? "—";
    return {
      key: s.clubId,
      // No status column here — every row is the same kind of thing, so the
      // chip row is suppressed and the search carries the screen.
      values: [club, s.responses],
      cells: [
        club,
        s.responses,
        fmt(s.clubAvg),
        fmt(s.headAvg),
        fmt(s.viceAvg),
        <Link
          key="o"
          href={`/admin/feedback/${periodId}/${s.clubId}`}
          className="btn btn-ghost btn-sm"
        >
          Open
        </Link>,
      ],
    };
  });

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">
            <Link href="/admin/feedback">Feedback</Link>
          </div>
          <h1 style={{ margin: "8px 0 0" }}>
            {istNumericDate(period.openedAt)} –{" "}
            {period.closedAt ? istNumericDate(period.closedAt) : "present"}
          </h1>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <Link className="btn btn-sm" href={`/admin/feedback/${period.id}/analytics`}>
            Analytics
          </Link>
          <a
            className="btn btn-ghost btn-sm"
            href={`/api/admin/feedback/export?period=${period.id}`}
          >
            Export CSV
          </a>
        </div>
      </div>

      <p className="label" style={{ marginTop: 10, color: "var(--ink-2)" }}>
        {responses.length} responses · averages are advisory, not evidence —
        there is no submission limit.
      </p>

      {summary.length === 0 ? (
        <div className="cal-empty" style={{ marginTop: 18 }}>
          No responses yet.
        </div>
      ) : (
        <AdminTable
          heading="Clubs"
          noun="club"
          wrapClassName="fb-summary"
          columns={[
            { label: "Club" },
            { label: "Responses" },
            /* On a phone the three averages ride one compact row rather than
               three stacked label/value pairs — six labelled rows per club
               across 14 clubs is an unreadable page. */
            { label: "Club", compact: true },
            { label: "Head", compact: true },
            { label: "Vice", compact: true },
            { label: "Read", action: true },
          ]}
          rows={summaryRows}
        />
      )}
    </div>
  );
}
