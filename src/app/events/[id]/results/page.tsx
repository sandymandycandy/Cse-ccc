import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel } from "@/components/ui/Surface";
import { ShareButton } from "@/components/ShareButton";
import { getEventDetail, getPublishedResults, type PublishedResult } from "@/lib/queries";
import { podiumOf, entrantsOf } from "@/lib/podium";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const event = await getEventDetail(id);
  return { title: event ? `Results — ${event.title}` : "Results" };
}

/**
 * Everyone on a standing, at one size. The rank belongs to the whole entry, so
 * nobody on it is rendered as a footnote to anybody else.
 */
function Entrants({ of }: { of: PublishedResult }) {
  return (
    <div className="entrants">
      {entrantsOf(of).map((p, i) => (
        <div className="entrant" key={`${p.roll}-${i}`}>
          <span>{p.name}</span>
          <span className="roll">{p.roll}</span>
        </div>
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

  // Only carry a Team column when team names actually exist. Checking "has any
  // team data" instead put a column of dashes next to every row on events whose
  // entries have members but no name.
  const hasTeamNames = rounds.some((r) => r.results.some((x) => x.team_name));

  return (
    <section className="section results" style={{ paddingTop: 56 }}>
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
        <div className="results-rounds">
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
                    {c.team_name ? <div className="result-team">{c.team_name}</div> : null}
                    <Entrants of={c} />
                    {showScore && c.score != null ? (
                      <div className="champion-foot">
                        <span>Score</span>
                        <span className="score">{c.score}</span>
                      </div>
                    ) : null}
                  </div>
                ))}

                {runners.length > 0 ? (
                  <ol className="runners">
                    {runners.map((r) => (
                      <li className="runner" data-place={r.rank} key={r.roll_no}>
                        <div className="runner-place">
                          {r.rank === 2 ? "Second" : "Third"}
                        </div>
                        {r.team_name ? <div className="result-team">{r.team_name}</div> : null}
                        <Entrants of={r} />
                        {showScore && r.score != null ? (
                          <div className="runner-foot">
                            <span>Score</span>
                            <span className="score">{r.score}</span>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                ) : null}

                {podium.length > 0 ? (
                  <div className="label" style={{ margin: "24px 0 -6px", color: "var(--ink-3)" }}>
                    Full standings
                  </div>
                ) : null}

                {/* One row per entry, one cell listing its people — rather than a
                    Name column, a Roll column and a comma-jammed Members column
                    all describing the same entry. `.tablewrap.cards` collapses
                    each row to a card below 720px. */}
                <div className="tablewrap cards" style={{ marginTop: 12 }}>
                  <table className="admin">
                    <thead>
                      <tr>
                        <th style={{ width: 64 }}>Rank</th>
                        {hasTeamNames ? <th>Team</th> : null}
                        <th>Participants</th>
                        {showScore ? <th style={{ width: 90 }}>Score</th> : null}
                        {round.showAdvanced ? <th style={{ width: 100 }}>Advanced</th> : null}
                        {round.showRemarks ? <th>Remarks</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {round.results.map((r) => (
                        <tr key={r.roll_no}>
                          <td data-label="Rank" style={{ color: "var(--ink-3)" }}>
                            {r.rank ?? "—"}
                          </td>
                          {hasTeamNames ? (
                            <td data-label="Team">{r.team_name ?? "—"}</td>
                          ) : null}
                          <td data-primary="">
                            <div className="standing-people">
                              {entrantsOf(r).map((p, i) => (
                                <div className="standing-person" key={`${p.roll}-${i}`}>
                                  <span>{p.name}</span>
                                  <span className="roll">{p.roll}</span>
                                </div>
                              ))}
                            </div>
                          </td>
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
