"use client";

import { useState } from "react";
import { matchesAny } from "@/lib/admin/roster-filter";
import {
  teamLabel,
  teamSearchValues,
  type Participant,
  type TeamGroup,
} from "@/lib/registration-form/participants";
import { isSafeHttpUrl } from "@/lib/url";

/**
 * The registered-participants roster with a free-text search box.
 *
 * Filtering runs in the browser over the already-loaded roster, so it is
 * instant and needs no round-trip. A team is kept whole when ANY of its people
 * or answers match — a card that rendered half a team would be worse than
 * useless on an attendance desk.
 */
export function ParticipantsRoster({
  teams,
  waitingTeams,
  hasTeams,
}: {
  teams: TeamGroup[];
  waitingTeams: TeamGroup[];
  hasTeams: boolean;
}) {
  const [q, setQ] = useState("");

  const keep = (list: TeamGroup[]) =>
    list.filter((t) => matchesAny(teamSearchValues(t), q));
  const shown = keep(teams);
  const waiting = keep(waitingTeams);

  const searching = q.trim() !== "";
  const total = teams.length + waitingTeams.length;
  const found = shown.length + waiting.length;
  const people = shown.reduce((n, t) => n + t.people.length, 0);

  if (total === 0) return <div className="cal-empty">No registrations yet.</div>;

  return (
    <>
      <input
        className="search-input"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name, roll, email, phone, department, team…"
        aria-label="Search registered participants by any detail"
      />

      {searching ? (
        <p className="label" style={{ color: "var(--ink-3)", marginTop: 2 }} aria-live="polite">
          {found === 0
            ? `Nothing matches “${q.trim()}”`
            : hasTeams
              ? `${found} of ${total} ${total === 1 ? "entry" : "entries"} · ${people} ${
                  people === 1 ? "person" : "people"
                }`
              : `${found} of ${total} matching`}
        </p>
      ) : null}

      {found === 0 ? null : (
        <>
          {shown.length > 0 ? (
            hasTeams ? (
              <TeamGrid teams={shown} />
            ) : (
              <SoloTable people={shown.flatMap((t) => t.people)} />
            )
          ) : null}

          {waiting.length > 0 ? (
            <div style={{ marginTop: 30 }}>
              <div className="label" style={{ marginBottom: 4 }}>
                Waitlist ({waiting.reduce((n, t) => n + t.people.length, 0)})
              </div>
              {hasTeams ? (
                <TeamGrid teams={waiting} />
              ) : (
                <SoloTable people={waiting.flatMap((t) => t.people)} />
              )}
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

function TeamGrid({ teams }: { teams: TeamGroup[] }) {
  return (
    <div className="team-grid">
      {teams.map((team) => (
        <article className="team-card" key={team.index}>
          <div className="team-card-head">
            <span className="n">{teamLabel(team)}</span>
            <span className="c">
              {team.people.length} {team.people.length === 1 ? "person" : "people"}
            </span>
          </div>

          {team.people.map((p) => (
            <div
              key={`${team.index}-${p.index}`}
              className={`team-person${p.role === "leader" ? " is-leader" : ""}`}
            >
              <div className="team-person-top">
                <span className="team-person-name">{p.name || "—"}</span>
                <span className={`badge ${p.role === "leader" ? "badge-open" : "badge-fast"}`}>
                  {p.role === "leader" ? "Leader" : p.role === "member" ? "Member" : "Registered"}
                </span>
              </div>
              <div className="team-person-meta">
                {[p.roll, p.department, p.year].filter(Boolean).join(" · ") || "—"}
              </div>
              <div className="team-person-meta">
                {[p.email, p.phone].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
          ))}

          {team.answers.length > 0 ? (
            <div className="team-answers">
              {team.answers.map((a) => (
                <div className="team-answer" key={a.key}>
                  <span className="k">{a.label}</span>
                  <span className="v">
                    {a.value && isSafeHttpUrl(a.value) ? (
                      <a
                        href={a.value}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--forest)" }}
                      >
                        {a.value} ↗
                      </a>
                    ) : (
                      a.value || "—"
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

/** Events with no team block: a plain numbered list of the people who signed up. */
function SoloTable({ people }: { people: Participant[] }) {
  return (
    <div className="tablewrap cards" style={{ marginTop: 18 }}>
      <table className="admin">
        <thead>
          <tr>
            <th style={{ width: 52 }}>#</th>
            <th>Name</th>
            <th>Roll</th>
            <th>Dept · Yr</th>
            <th>Email</th>
            <th>Phone</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.index}>
              <td data-label="#" style={{ color: "var(--ink-3)" }}>
                {p.index}
              </td>
              <td data-primary="" style={{ fontWeight: 500 }}>
                {p.name || "—"}
              </td>
              <td data-label="Roll">{p.roll || "—"}</td>
              <td data-label="Dept · Yr">
                {p.department || "—"}
                {p.year ? ` · ${p.year}` : ""}
              </td>
              <td data-label="Email">{p.email || "—"}</td>
              <td data-label="Phone">{p.phone || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
