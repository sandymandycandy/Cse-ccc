import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel } from "@/components/ui/Surface";
import { ShareButton } from "@/components/ShareButton";
import { getEventDetail, getPublishedResults, type PublishedResult } from "@/lib/queries";
import { podiumOf } from "@/lib/podium";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const event = await getEventDetail(id);
  return { title: event ? `Results — ${event.title}` : "Results" };
}

/** "Bob Singh VTU202 · Cara M VTU303" — name + roll, which is all we publish. */
function Members({ of }: { of: PublishedResult }) {
  if (!of.team_members || of.team_members.length === 0) return null;
  return (
    <div className="result-members">
      {of.team_members.map((m, i) => (
        <span key={`${m.roll}-${i}`}>
          {i > 0 ? " · " : ""}
          {m.name} <span className="roll">{m.roll}</span>
        </span>
      ))}
    </div>
  );
}

export default async function EventResultsPage({ params }: Params) {
  const { id } = await params;
  const [event, rounds] = await Promise.all([
    getEventDetail(id),
    getPublishedResults(id),
  ]);
  if (!event) notFound();

  // Solo events, and rounds from before team names existed, keep a table
  // without the team columns rather than one full of dashes.
  const hasTeams = rounds.some((r) =>
    r.results.some((x) => x.team_name || (x.team_members?.length ?? 0) > 0),
  );

  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="results-head">
        <div>
          <Link href={`/events/${id}`} className="label" style={{ color: "var(--forest)" }}>
            ← {event.title}
          </Link>
          <h1 style={{ margin: "14px 0 0" }}>Results</h1>
          {/* A results link gets passed around, so the page names its own event. */}
          <div className="results-context">
            {[event.club, `${event.day} ${event.dateLabel}`, event.venue]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <ShareButton title={`Results — ${event.title}`} />
      </div>

      {rounds.length === 0 ? (
        <p className="body-text" style={{ marginTop: 24, color: "var(--ink-2)" }}>
          Results haven&rsquo;t been published yet.
        </p>
      ) : (
        <div className="stack" style={{ gap: 20, marginTop: 26 }}>
          {rounds.map((round) => {
            const podium = podiumOf(round.results);
            const champions = podium.filter((r) => r.rank === 1);
            const runners = podium.filter((r) => r.rank !== 1);
            const showScore = round.showScore;

            return (
              <Panel key={round.id}>
                <div className="label">{round.name}</div>

                {champions.map((c) => (
                  <div className="champion" key={c.roll_no}>
                    <div className="champion-eyebrow">
                      {champions.length > 1 ? "Joint champion" : "Champion"}
                    </div>
                    <div className="champion-name">{c.display_name ?? c.roll_no}</div>
                    {c.team_name ? <div className="result-team">{c.team_name}</div> : null}
                    <Members of={c} />
                    <div className="champion-foot">
                      <span>{c.roll_no}</span>
                      {showScore && c.score != null ? (
                        <span className="score">{c.score}</span>
                      ) : null}
                    </div>
                  </div>
                ))}

                {runners.length > 0 ? (
                  <ol className="runners">
                    {runners.map((r) => (
                      <li className="runner" data-place={r.rank} key={r.roll_no}>
                        <div className="runner-place">
                          {r.rank === 2 ? "Second" : "Third"}
                        </div>
                        <div className="runner-name">{r.display_name ?? r.roll_no}</div>
                        {r.team_name ? <div className="result-team">{r.team_name}</div> : null}
                        <Members of={r} />
                        <div className="runner-foot">
                          <span>{r.roll_no}</span>
                          {showScore && r.score != null ? (
                            <span className="score">{r.score}</span>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : null}

                {podium.length > 0 ? (
                  <div className="label" style={{ margin: "24px 0 -6px", color: "var(--ink-3)" }}>
                    Full standings
                  </div>
                ) : null}

                {/* `.tablewrap.cards` turns each row into a readable card below
                    720px, so a phone never has to pan sideways. */}
                <div className="tablewrap cards" style={{ marginTop: 12 }}>
                  <table className="admin">
                    <thead>
                      <tr>
                        <th style={{ width: 56 }}>Rank</th>
                        <th>Name</th>
                        <th>Roll</th>
                        {hasTeams ? <th>Team</th> : null}
                        {hasTeams ? <th>Members</th> : null}
                        {showScore ? <th>Score</th> : null}
                        {round.showAdvanced ? <th>Advanced</th> : null}
                        {round.showRemarks ? <th>Remarks</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {round.results.map((r) => (
                        <tr key={r.roll_no}>
                          <td data-label="Rank" style={{ color: "var(--ink-3)" }}>
                            {r.rank ?? "—"}
                          </td>
                          <td data-primary="" style={{ fontWeight: 500 }}>
                            {r.display_name ?? "—"}
                          </td>
                          <td data-label="Roll" style={{ color: "var(--ink-2)" }}>
                            {r.roll_no}
                          </td>
                          {hasTeams ? (
                            <td data-label="Team">{r.team_name ?? "—"}</td>
                          ) : null}
                          {hasTeams ? (
                            <td data-label="Members">
                              {r.team_members && r.team_members.length > 0
                                ? r.team_members.map((m) => `${m.name} ${m.roll}`).join(", ")
                                : "—"}
                            </td>
                          ) : null}
                          {showScore ? <td data-label="Score">{r.score ?? "—"}</td> : null}
                          {round.showAdvanced ? (
                            <td data-label="Advanced" style={{ color: "var(--forest)" }}>
                              {r.advanced ? "Yes" : "—"}
                            </td>
                          ) : null}
                          {round.showRemarks ? (
                            <td data-label="Remarks">{r.remarks ?? "—"}</td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </section>
  );
}
