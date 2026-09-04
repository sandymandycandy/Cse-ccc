import Link from "next/link";
import type { FeedbackAnalytics as Analytics } from "@/lib/admin/feedback-analytics";
import { THIN_SAMPLE } from "@/lib/admin/feedback-analytics";

const fmt = (n: number | null) => (n == null ? "—" : n.toFixed(1));

/** A delta chip. Direction is carried by the glyph AND the sign, so it never
 *  depends on colour alone. */
function Delta({ value, unit = "" }: { value: number | null; unit?: string }) {
  if (value == null) return null;
  const dir = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const arrow = value > 0 ? "▲" : value < 0 ? "▼" : "■";
  const sign = value > 0 ? "+" : "";
  return (
    <div className="fb-delta" data-dir={dir}>
      {arrow} {sign}
      {value}
      {unit}
    </div>
  );
}

/** Rating distribution, 1★–5★. Single hue: the bar LENGTH encodes magnitude, so
 *  colouring by rating would encode the same fact twice. Every bar is labelled
 *  because there are only five — this is not "a number on every point". */
function Distribution({ title, counts }: { title: string; counts: number[] }) {
  const max = Math.max(1, ...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  return (
    <div className="fb-chart">
      <h3>
        {title} · {total} rated
      </h3>
      {[5, 4, 3, 2, 1].map((star) => {
        const n = counts[star - 1];
        return (
          <div className="fb-bar-row" key={star}>
            <span className="fb-bar-key">{star} ★</span>
            <span className="fb-bar-track">
              <span
                className="fb-bar-fill"
                style={{ width: `${(n / max) * 100}%` }}
                title={`${n} response${n === 1 ? "" : "s"} at ${star} star${star === 1 ? "" : "s"}`}
              />
            </span>
            <span className="fb-bar-n">{n}</span>
          </div>
        );
      })}
    </div>
  );
}

export function FeedbackAnalyticsView({
  analytics,
  periodId,
  periodLabel,
  thresholds,
  belowThreshold,
}: {
  analytics: Analytics;
  periodId: string;
  periodLabel: string;
  thresholds: number[];
  belowThreshold: number;
}) {
  const a = analytics;
  const peak = Math.max(1, ...a.timeline.map((d) => d.count));

  return (
    <>
      {/* GUARD 3 (design D3): if responses are being repeated, that must be read
          BEFORE any average below it — hence the top of the page. */}
      {a.integrity.duplicateVtus > 0 ? (
        <div className="fb-note" style={{ borderLeftColor: "var(--rust)" }}>
          <p className="body-text">
            <strong>
              {a.integrity.duplicateVtus} VTU
              {a.integrity.duplicateVtus === 1 ? "" : "s"} submitted more than once
            </strong>{" "}
            — {a.integrity.responsesFromDuplicates} of {a.totals.responses} responses.
            There is no submission limit, so read every average below as advisory,
            not as evidence.
          </p>
        </div>
      ) : null}

      <div className="admin-stats">
        <div className="admin-stat">
          <div className="n">{a.totals.responses}</div>
          <div className="label">Responses</div>
          {a.trend ? <Delta value={a.trend.responsesDelta} /> : null}
        </div>
        <div className="admin-stat">
          <div className="n">
            {a.totals.clubsCovered}
            <span style={{ fontSize: 20, color: "var(--ink-3)" }}>/{a.totals.clubsTotal}</span>
          </div>
          <div className="label">Clubs heard from</div>
        </div>
        <div className="admin-stat">
          <div className="n">{fmt(a.totals.clubAvg)}</div>
          <div className="label">Club rating</div>
          {a.trend ? <Delta value={a.trend.clubAvgDelta} /> : null}
        </div>
        <div className="admin-stat">
          <div className="n">{fmt(a.totals.headAvg)}</div>
          <div className="label">Head rating</div>
          {a.trend ? <Delta value={a.trend.headAvgDelta} /> : null}
        </div>
        <div className="admin-stat">
          <div className="n">{fmt(a.totals.viceAvg)}</div>
          <div className="label">Vice head rating</div>
          {a.trend ? <Delta value={a.trend.viceAvgDelta} /> : null}
        </div>
        <div className="admin-stat">
          <div className="n">{a.totals.reachPct}%</div>
          <div className="label">Of members on roster</div>
        </div>
      </div>

      {a.trend ? (
        <p className="label" style={{ marginTop: 12, color: "var(--ink-3)" }}>
          Deltas compare against {a.trend.label}.
        </p>
      ) : (
        <p className="label" style={{ marginTop: 12, color: "var(--ink-3)" }}>
          First collection — no earlier period to compare against yet.
        </p>
      )}

      <h2 style={{ marginTop: 32 }}>How the ratings fall</h2>
      <p className="label" style={{ marginTop: 6, color: "var(--ink-2)" }}>
        An average of 4.0 built from 5s and 3s is a different club from a steady
        4.0. The spread is the point.
      </p>
      <div className="fb-charts">
        <Distribution title="The club" counts={a.distribution.club} />
        <Distribution title="Club head" counts={a.distribution.head} />
        <Distribution title="Vice head" counts={a.distribution.vice} />
      </div>

      {a.timeline.length > 0 ? (
        <>
          <h2 style={{ marginTop: 32 }}>Responses per day</h2>
          <p className="label" style={{ marginTop: 6, color: "var(--ink-2)" }}>
            When this flattens out, the window has done its work and can be closed.
          </p>
          <div className="fb-chart" style={{ marginTop: 14 }}>
            <div className="fb-timeline">
              {a.timeline.map((d) => (
                <span
                  key={d.day}
                  className="fb-tl-bar"
                  style={{ height: `${(d.count / peak) * 100}%` }}
                  title={`${d.day}: ${d.count} response${d.count === 1 ? "" : "s"}`}
                  {...(d.count === peak ? { "data-peak": String(d.count) } : {})}
                />
              ))}
            </div>
            <div className="fb-tl-axis">
              <span>{a.timeline[0].day.slice(5)}</span>
              <span>{a.timeline[a.timeline.length - 1].day.slice(5)}</span>
            </div>
          </div>
        </>
      ) : null}

      <h2 style={{ marginTop: 32 }}>Who hasn&rsquo;t been heard from</h2>
      {a.silentClubs.length === 0 ? (
        <p className="body-text" style={{ marginTop: 8 }}>
          Every active club has at least one response.
        </p>
      ) : (
        <>
          <p className="label" style={{ marginTop: 6, color: "var(--ink-2)" }}>
            {a.silentClubs.length} club{a.silentClubs.length === 1 ? "" : "s"} with no
            responses. Worth chasing before the window closes.
          </p>
          <div className="stack" style={{ marginTop: 12, gap: 8 }}>
            {a.silentClubs.map((c) => (
              <span key={c.id} className="chip">
                {c.name}
              </span>
            ))}
          </div>
        </>
      )}

      <h2 style={{ marginTop: 32 }}>Watchlist</h2>
      <div className="stack" style={{ marginTop: 8, gap: 8 }}>
        <span className="label" style={{ color: "var(--ink-2)" }}>
          Rated below
        </span>
        {thresholds.map((t) => (
          <Link
            key={t}
            href={`/admin/feedback/${periodId}/analytics?below=${t}`}
            className={t === belowThreshold ? "btn btn-sm" : "btn btn-ghost btn-sm"}
          >
            {t.toFixed(1)}
          </Link>
        ))}
      </div>

      {/* GUARD 2: nothing under THIN_SAMPLE responses can appear here, however
          low it scored. One furious response must not name a person. */}
      <p className="label" style={{ marginTop: 12, color: "var(--ink-3)" }}>
        Only clubs and people with at least {THIN_SAMPLE} responses appear —
        anything thinner is reported on {periodLabel}&rsquo;s club pages but never
        ranked here.
      </p>

      {a.clubWatchlist.length === 0 && a.leaderWatchlist.length === 0 ? (
        <div className="cal-empty" style={{ marginTop: 14 }}>
          Nothing below {belowThreshold.toFixed(1)} with enough responses to judge.
        </div>
      ) : (
        <div className="tablewrap cards" style={{ marginTop: 14 }}>
          <table className="admin">
            <thead>
              <tr>
                <th>Who</th>
                <th>Where</th>
                <th>Responses</th>
                <th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {a.clubWatchlist.map((c) => (
                <tr key={`club-${c.clubId}`}>
                  <td data-primary>{c.clubName}</td>
                  <td data-label="Role">The club itself</td>
                  {/* GUARD 1: the count never leaves the average's side. */}
                  <td data-label="Responses">{c.responses}</td>
                  <td data-label="Rating">{fmt(c.clubAvg)}</td>
                </tr>
              ))}
              {a.leaderWatchlist.map((l) => (
                <tr key={`leader-${l.role}-${l.clubName}-${l.name}`}>
                  <td data-primary>{l.name}</td>
                  <td data-label="Role">
                    {l.role} · {l.clubName}
                  </td>
                  <td data-label="Responses">{l.responses}</td>
                  <td data-label="Rating">{l.avg.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 style={{ marginTop: 32 }}>How much people wrote</h2>
      <div className="admin-stats">
        <div className="admin-stat">
          <div className="n">{a.engagement.withActivities}</div>
          <div className="label">Described the activities</div>
        </div>
        <div className="admin-stat">
          <div className="n">{a.engagement.withSuggestions}</div>
          <div className="label">Left a suggestion</div>
        </div>
      </div>
      <p className="label" style={{ marginTop: 12, color: "var(--ink-3)" }}>
        The free text is where the substance is — the numbers only tell you where
        to look.
      </p>
    </>
  );
}
