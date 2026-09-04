import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { listPeriods, listResponses, clubNames } from "@/lib/admin/feedback";
import { summariseByClub } from "@/lib/feedback/summary";
import { istNumericDate } from "@/lib/datetime";

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

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">
            <Link href="/admin/feedback">Feedback</Link>
          </div>
          <h1 style={{ margin: "6px 0 0" }}>
            {istNumericDate(period.openedAt)} –{" "}
            {period.closedAt ? istNumericDate(period.closedAt) : "present"}
          </h1>
        </div>
        <a
          className="btn btn-ghost btn-sm"
          href={`/api/admin/feedback/export?period=${period.id}`}
        >
          Export CSV
        </a>
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
        <div className="tablewrap cards fb-summary" style={{ marginTop: 18 }}>
          <table className="admin">
            <thead>
              <tr>
                <th>Club</th>
                <th>Responses</th>
                <th>Club</th>
                <th>Head</th>
                <th>Vice</th>
                <th>Read</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.clubId}>
                  <td data-primary>{names.get(s.clubId) ?? "—"}</td>
                  <td data-label="Responses">{s.responses}</td>
                  {/* On a phone the three averages ride one compact row rather
                      than three stacked label/value pairs — six labelled rows
                      per club across 14 clubs is an unreadable page. */}
                  <td data-label="Club" data-compact>{fmt(s.clubAvg)}</td>
                  <td data-label="Head" data-compact>{fmt(s.headAvg)}</td>
                  <td data-label="Vice" data-compact>{fmt(s.viceAvg)}</td>
                  <td data-action>
                    <Link
                      href={`/admin/feedback/${period.id}/${s.clubId}`}
                      className="btn btn-ghost btn-sm"
                    >
                      Open
                    </Link>
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
