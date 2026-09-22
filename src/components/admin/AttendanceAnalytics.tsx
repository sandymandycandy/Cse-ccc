import { istNumericDate } from "@/lib/datetime";
import type { ClubAnalytics, SessionStat } from "@/lib/admin/attendance-analytics";

const THRESHOLDS = [50, 60, 75, 85] as const;

function Tile({ n, label, hint }: { n: number | string; label: string; hint?: string }) {
  return (
    <div className="admin-stat">
      <span className="n">{n}</span>
      <span className="label">{label}</span>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

function SessionCard({ title, stat }: { title: string; stat: SessionStat }) {
  return (
    <div className="card att-card">
      <div className="label">{title}</div>
      <div className="att-card-title">{stat.title}</div>
      <div className="body-text">
        {stat.present} present · {stat.pctOfStrength}% of strength
      </div>
      <div className="hint">{istNumericDate(stat.date)}</div>
    </div>
  );
}

/**
 * The attendance analytics panel. Pure markup over an already-computed
 * `ClubAnalytics` — `clubParam` is the `?club=` value to preserve in the
 * watchlist threshold form (null for own-club heads, who have no club picker).
 */
export function AttendanceAnalytics({
  analytics, clubParam,
}: {
  analytics: ClubAnalytics; clubParam: string | null;
}) {
  const { membership, rates, sessions, watchlist } = analytics;

  return (
    <section className="att-analytics">
      <div className="admin-stats">
        <Tile n={membership.total} label="Total members" />
        <Tile n={membership.active} label="Active" />
        <Tile n={membership.pending} label="Pending onboarding" />
        <Tile n={`${rates.overallPct}%`} label="Overall attendance" hint={`${rates.totalAttended}/${rates.totalEligible} present·sessions`} />
        <Tile n={rates.avgPresentPerSession} label="Avg present / session" />
        <Tile n={sessions.total} label="Sessions held" hint={`${sessions.open} open · ${sessions.closed} closed`} />
      </div>

      <h3 className="att-sub-title">Per-session</h3>
      {sessions.total === 0 ? (
        <p className="body-text att-muted">No sessions yet.</p>
      ) : (
        <div className="grid2 att-cards">
          {sessions.most ? <SessionCard title="Most attended" stat={sessions.most} /> : null}
          {/* Only show "least" once there are two or more distinct sessions to compare. */}
          {sessions.total > 1 && sessions.least ? <SessionCard title="Least attended" stat={sessions.least} /> : null}
        </div>
      )}

      <h3 className="att-sub-title">Low-attendance watchlist</h3>
      <form method="get" className="att-threshold">
        {clubParam ? <input type="hidden" name="club" value={clubParam} /> : null}
        <label className="label" htmlFor="below">Below</label>
        <select id="below" name="below" defaultValue={String(watchlist.threshold)} className="select-input att-threshold-select">
          {THRESHOLDS.map((t) => <option key={t} value={t}>{t}%</option>)}
        </select>
        <button className="btn btn-sm">Apply</button>
      </form>
      {watchlist.members.length === 0 ? (
        <p className="body-text att-muted">
          Every member who has had a session is at or above {watchlist.threshold}%.
        </p>
      ) : (
        <div className="tablewrap cards">
          <table className="admin" data-density="comfortable" aria-label="Low-attendance watchlist">
            <thead><tr><th className="att-rank-col">#</th><th>Member</th><th>Attended</th><th>Sessions</th><th>%</th></tr></thead>
            <tbody>
              {watchlist.members.map((mem, i) => (
                <tr key={mem.memberId}>
                  <td className="att-rank-col">{i + 1}</td>
                  <td data-primary="" className="att-row-title">{mem.name}</td>
                  <td data-label="Attended">{mem.attended}</td>
                  <td data-label="Sessions">{mem.eligible}</td>
                  <td data-label="%"><span className="att-pct" data-risk="true">{mem.pct}%</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
