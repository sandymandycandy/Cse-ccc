import { istNumericDate } from "@/lib/datetime";
import type { ClubAnalytics, SessionStat } from "@/lib/admin/attendance-analytics";

const THRESHOLDS = [50, 60, 75, 85] as const;

function Tile({ n, label, hint }: { n: number | string; label: string; hint?: string }) {
  return (
    <div className="admin-stat">
      <div className="n">{n}</div>
      <div className="label">{label}</div>
      {hint ? <div className="hint" style={{ marginTop: 4 }}>{hint}</div> : null}
    </div>
  );
}

function SessionCard({ title, stat }: { title: string; stat: SessionStat }) {
  return (
    <div className="card">
      <div className="label">{title}</div>
      <div style={{ font: "400 17px var(--serif)", margin: "4px 0 2px" }}>{stat.title}</div>
      <div className="body-text">
        {stat.present} present · {stat.pctOfStrength}% of strength
      </div>
      <div className="hint" style={{ marginTop: 4 }}>{istNumericDate(stat.date)}</div>
    </div>
  );
}

/**
 * The attendance analytics panel shown at the top of the dashboard. Pure markup
 * over an already-computed `ClubAnalytics` — `clubParam` is the `?club=` value to
 * preserve in the watchlist threshold form (null for own-club heads, who have no
 * club picker).
 */
export function AttendanceAnalytics({
  analytics, clubParam,
}: {
  analytics: ClubAnalytics; clubParam: string | null;
}) {
  const { membership, rates, sessions, watchlist } = analytics;

  return (
    <section style={{ marginTop: 20 }}>
      <h2 style={{ font: "400 18px var(--serif)", margin: "0 0 4px" }}>Analytics</h2>

      <div className="admin-stats" style={{ marginTop: 14 }}>
        <Tile n={membership.total} label="Total members" />
        <Tile n={membership.active} label="Active" />
        <Tile n={membership.pending} label="Pending onboarding" />
        <Tile n={`${rates.overallPct}%`} label="Overall attendance" hint={`${rates.totalAttended}/${rates.totalEligible} present·eligible`} />
        <Tile n={rates.avgPresentPerSession} label="Avg present / session" />
        <Tile n={sessions.total} label="Sessions held" hint={`${sessions.open} open · ${sessions.closed} closed`} />
      </div>

      <h3 style={{ font: "400 15px var(--serif)", margin: "24px 0 0" }}>Per-session</h3>
      {sessions.total === 0 ? (
        <p className="body-text" style={{ color: "var(--ink-3)", marginTop: 6 }}>No sessions yet.</p>
      ) : (
        <div className="grid2" style={{ marginTop: 12 }}>
          {sessions.most ? <SessionCard title="Most attended" stat={sessions.most} /> : null}
          {/* Only show "least" once there are two or more distinct sessions to compare. */}
          {sessions.total > 1 && sessions.least ? <SessionCard title="Least attended" stat={sessions.least} /> : null}
        </div>
      )}

      <h3 style={{ font: "400 15px var(--serif)", margin: "28px 0 0" }}>Low-attendance watchlist</h3>
      <form method="get" style={{ display: "flex", gap: 8, alignItems: "center", margin: "8px 0 12px" }}>
        {clubParam ? <input type="hidden" name="club" value={clubParam} /> : null}
        <label className="label" htmlFor="below">Below</label>
        <select id="below" name="below" defaultValue={String(watchlist.threshold)} style={{ maxWidth: 90 }}>
          {THRESHOLDS.map((t) => <option key={t} value={t}>{t}%</option>)}
        </select>
        <button className="btn btn-sm">Apply</button>
      </form>
      {watchlist.members.length === 0 ? (
        <p className="body-text" style={{ color: "var(--ink-3)" }}>
          Every member with eligible sessions is at or above {watchlist.threshold}%.
        </p>
      ) : (
        <div className="tablewrap">
          <table className="admin">
            <thead><tr><th style={{ width: 44 }}>#</th><th>Member</th><th>Attended</th><th>Eligible</th><th>%</th></tr></thead>
            <tbody>
              {watchlist.members.map((mem, i) => (
                <tr key={mem.memberId}>
                  <td>{i + 1}</td>
                  <td style={{ fontWeight: 500 }}>{mem.name}</td>
                  <td>{mem.attended}</td>
                  <td>{mem.eligible}</td>
                  <td style={{ color: "var(--rust)" }}>{mem.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
