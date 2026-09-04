import Link from "next/link";
import type { ClubVitality, VitalityFlag } from "@/lib/admin/club-vitality";
import { LOW_TURNOUT, MIN_SESSIONS } from "@/lib/admin/club-vitality";

/**
 * The council's cross-club triage table. Pure markup over already-computed
 * `ClubVitality[]` — no fetching, no math, so the numbers here are exactly the
 * ones `computeClubVitality` was tested on.
 *
 * Every rate is rendered with the sessions and attended/eligible totals it came
 * from. There is no shape in this component that shows a percentage alone.
 *
 * `.tablewrap.cards` collapses each row into a card below 720px, which is why
 * every cell carries `data-label` — that attribute IS the header on a phone.
 */

const FLAG_LABEL: Record<VitalityFlag, string> = {
  empty: "No members",
  dormant: "Not meeting",
  "unmet-demand": "Unmet demand",
  "low-turnout": "Low turnout",
};

/** Rust for "this club is not running"; clay for "worth a look". */
const FLAG_TONE: Record<VitalityFlag, "rejected" | "pending"> = {
  empty: "rejected",
  dormant: "rejected",
  "unmet-demand": "pending",
  "low-turnout": "pending",
};

function lastMet(days: number | null): string {
  if (days === null) return "Never";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export function ClubHealth({
  rows,
  windowDays,
}: {
  rows: ClubVitality[];
  windowDays: number;
}) {
  const flagged = rows.filter((r) => r.flags.length > 0);

  if (rows.length === 0) {
    return (
      <p className="body-text" style={{ color: "var(--ink-3)", marginTop: 18 }}>
        No active clubs.
      </p>
    );
  }

  return (
    <section style={{ marginTop: 20 }}>
      <div className="admin-stats">
        <div className="admin-stat">
          <div className="n">{rows.length}</div>
          <div className="label">Active clubs</div>
        </div>
        <div className="admin-stat">
          <div className="n">{flagged.length}</div>
          <div className="label">Needing attention</div>
        </div>
        <div className="admin-stat">
          <div className="n">{rows.reduce((a, r) => a + r.activeMembers, 0)}</div>
          <div className="label">Members on rosters</div>
        </div>
        <div className="admin-stat">
          <div className="n">{rows.reduce((a, r) => a + r.sessionsInWindow, 0)}</div>
          <div className="label">Sessions in {windowDays} days</div>
        </div>
      </div>

      {flagged.length === 0 ? (
        <p className="note" style={{ marginTop: 18 }}>
          Nothing flagged: every active club has members and has met in the last{" "}
          {windowDays} days.
        </p>
      ) : null}

      <div className="tablewrap cards" style={{ marginTop: 16 }}>
        <table className="admin">
          <thead>
            <tr>
              <th>Club</th>
              <th>Members</th>
              <th>Sessions</th>
              <th>Last met</th>
              <th>Attendance</th>
              <th>Flags</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.clubId}>
                <td data-primary data-label="Club" style={{ fontWeight: 500 }}>
                  {r.name}
                </td>
                <td data-label="Members">{r.activeMembers}</td>
                <td data-label="Sessions">
                  {r.sessionsInWindow}
                  <span className="hint"> of {r.sessionsAllTime} all time</span>
                </td>
                <td data-label="Last met">{lastMet(r.daysSinceLastSession)}</td>
                <td data-label="Attendance">
                  {/* The rate never appears without the n it came from. */}
                  {r.eligible === 0 ? (
                    <span style={{ color: "var(--ink-3)" }}>—</span>
                  ) : (
                    <>
                      {r.ratePct}%
                      <span className="hint">
                        {" "}
                        {r.attended}/{r.eligible} over {r.sessionsInWindow}{" "}
                        {r.sessionsInWindow === 1 ? "session" : "sessions"}
                      </span>
                    </>
                  )}
                </td>
                <td data-label="Flags">
                  {r.flags.length === 0 ? (
                    <span style={{ color: "var(--ink-3)" }}>—</span>
                  ) : (
                    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6 }}>
                      {r.flags.map((f) => (
                        <span key={f} className={`abadge abadge-${FLAG_TONE[f]}`}>
                          {FLAG_LABEL[f]}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td data-action>
                  {/* `resolveAttendanceScope` re-resolves `?club=` server-side
                      against manage:members, so these links cannot over-grant. */}
                  <span className="stack">
                    <Link className="btn btn-sm" href={`/admin/attendance?club=${r.clubId}`}>
                      Attendance
                    </Link>
                    <Link
                      className="btn btn-sm"
                      href={`/admin/attendance/analytics?club=${r.clubId}`}
                    >
                      Analytics
                    </Link>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="hint" style={{ marginTop: 14 }}>
        Low turnout is only flagged below {LOW_TURNOUT}% and only once a club has
        held at least {MIN_SESSIONS} sessions in the window — one sparse meeting is
        not a turnout problem.
      </p>
    </section>
  );
}
