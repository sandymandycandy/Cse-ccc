import Link from "next/link";
import type { ClubVitality, VitalityFlag } from "@/lib/admin/club-vitality";
import { LOW_TURNOUT, MIN_SESSIONS } from "@/lib/admin/club-vitality";
import {
  FLAG_LABEL,
  FLAG_TONE,
  diagnosis,
  lastMet,
  plural,
  turnoutSummary,
} from "@/lib/admin/club-vitality-copy";

/**
 * The council's cross-club triage. Markup only — the numbers come from
 * `computeClubVitality` and the words from `club-vitality-copy`, both of which
 * are unit-tested; nothing here computes or phrases anything.
 *
 * ⚠️ THE SPLIT IS THE POINT: flagged clubs get a full row with the diagnosis and
 * its actions, the rest get one compact link each. A single 14-row table buried
 * the five clubs that need a conversation among nine that do not, and on a phone
 * it became fourteen seven-line cards. `rows` arrives in triage order, so the
 * flagged ones are already a prefix — the partition below only separates them,
 * it never re-sorts.
 */

function Flags({ flags }: { flags: VitalityFlag[] }) {
  return (
    <>
      {flags.map((f) => (
        <span key={f} className={`abadge abadge-${FLAG_TONE[f]}`}>
          {FLAG_LABEL[f]}
        </span>
      ))}
    </>
  );
}

export function ClubHealth({
  rows,
  windowDays,
}: {
  rows: ClubVitality[];
  windowDays: number;
}) {
  if (rows.length === 0) {
    return (
      <p className="body-text" style={{ color: "var(--ink-3)", marginTop: 18 }}>
        No active clubs yet. Add one from Clubs to start tracking health here.
      </p>
    );
  }

  const flagged = rows.filter((r) => r.flags.length > 0);
  const steady = rows.filter((r) => r.flags.length === 0);
  const members = rows.reduce((a, r) => a + r.activeMembers, 0);
  const meetings = rows.reduce((a, r) => a + r.sessionsInWindow, 0);

  return (
    <>
      {/* One quiet line of scale, rather than four tiles repeating the counts
          the section headings already carry. */}
      <p className="health-meta" style={{ marginTop: 10 }}>
        {members} members across {rows.length} active {plural(rows.length, "club")} ·{" "}
        {meetings} {plural(meetings, "meeting")} in the last {windowDays} days
      </p>

      <section style={{ marginTop: 30 }}>
        <h2 className="label" style={{ display: "block" }}>
          Needs attention · {flagged.length}
        </h2>

        {flagged.length === 0 ? (
          <p className="note" style={{ marginTop: 12 }}>
            Nothing to chase. Every active club has members and has met in the last{" "}
            {windowDays} days.
          </p>
        ) : (
          <ul className="health">
            {flagged.map((r) => {
              const detail = diagnosis(r);
              return (
                <li key={r.clubId} className="health-row">
                  <div>
                    <div className="health-name">
                      {r.name}
                      <Flags flags={r.flags} />
                    </div>
                    {detail ? <p className="health-fact">{detail}</p> : null}
                    <p className="health-meta">
                      {lastMet(r.daysSinceLastSession)}
                      {/* Only worth saying when it differs from the window count. */}
                      {r.sessionsAllTime !== r.sessionsInWindow
                        ? ` · ${r.sessionsAllTime} ${plural(r.sessionsAllTime, "meeting")} in total`
                        : ""}
                    </p>
                  </div>
                  {/* `resolveAttendanceScope` re-resolves `?club=` server-side
                      against manage:members, so these links cannot over-grant. */}
                  <div className="health-actions">
                    <Link className="btn btn-sm" href={`/admin/attendance?club=${r.clubId}`}>
                      Attendance
                    </Link>
                    <Link
                      className="btn btn-sm"
                      href={`/admin/attendance/analytics?club=${r.clubId}`}
                    >
                      Analytics
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {steady.length > 0 ? (
        <section style={{ marginTop: 32 }}>
          <h2 className="label" style={{ display: "block" }}>
            Running normally · {steady.length}
          </h2>
          <div className="health">
            {steady.map((r) => {
              const over = turnoutSummary(r);
              return (
                <Link
                  key={r.clubId}
                  className="health-row"
                  href={`/admin/attendance/analytics?club=${r.clubId}`}
                >
                  <span className="health-name">{r.name}</span>
                  <span className="health-figures">
                    <span>
                      <b>{r.activeMembers}</b> {plural(r.activeMembers, "member")}
                    </span>
                    <span>
                      {over === null ? (
                        "No turnout yet"
                      ) : (
                        <>
                          <b>{r.ratePct}%</b> {over}
                        </>
                      )}
                    </span>
                    <span>{lastMet(r.daysSinceLastSession).replace("Last met ", "")}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Explicit type, not `className="hint"`: `.hint` is only defined as
          `.field .hint`, so outside a form field it renders unstyled. */}
      <p style={{ marginTop: 18, font: "400 12px / 1.6 var(--sans)", color: "var(--ink-3)" }}>
        Turnout counts each member only from the date they joined. A club is
        flagged for low turnout below {LOW_TURNOUT}%, and only once it has held{" "}
        {MIN_SESSIONS} meetings in the window — one sparse meeting is not a
        turnout problem.
      </p>
    </>
  );
}
