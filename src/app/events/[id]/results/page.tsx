import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel } from "@/components/ui/Surface";
import { getEventDetail, getPublishedResults } from "@/lib/queries";
import { podiumOf } from "@/lib/podium";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const event = await getEventDetail(id);
  return { title: event ? `Results — ${event.title}` : "Results" };
}

export default async function EventResultsPage({ params }: Params) {
  const { id } = await params;
  const [event, rounds] = await Promise.all([
    getEventDetail(id),
    getPublishedResults(id),
  ]);
  if (!event) notFound();

  // Solo events, and rounds from before team names existed, keep a table
  // without the column rather than one full of dashes.
  const hasTeams = rounds.some((r) => r.results.some((x) => x.team_name));

  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <Link href={`/events/${id}`} className="label" style={{ color: "var(--forest)" }}>
        ← {event.title}
      </Link>
      <h1 style={{ margin: "16px 0 0" }}>Results</h1>

      {rounds.length === 0 ? (
        <p className="body-text" style={{ marginTop: 20, color: "var(--ink-2)" }}>
          Results haven&rsquo;t been published yet.
        </p>
      ) : (
        <div className="stack" style={{ gap: 20, marginTop: 24 }}>
          {rounds.map((round) => {
            const podium = podiumOf(round.results);
            return (
              <Panel key={round.id}>
                <div className="label">{round.name}</div>

                {podium.length > 0 ? (
                  <ol className="podium">
                    {podium.map((r) => (
                      <li className="podium-card" data-place={r.rank} key={r.roll_no}>
                        <span className="podium-rank">{r.rank}</span>
                        <div className="podium-name">{r.display_name ?? r.roll_no}</div>
                        {r.team_name ? <div className="podium-team">{r.team_name}</div> : null}
                        <div className="podium-meta">
                          <span>{r.roll_no}</span>
                          {round.showScore && r.score != null ? (
                            <span className="score">{r.score}</span>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : null}

                {podium.length > 0 ? (
                  <div className="label" style={{ margin: "22px 0 -4px", color: "var(--ink-3)" }}>
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
                        {hasTeams ? <th>Team</th> : null}
                        <th>Roll</th>
                        {round.showScore ? <th>Score</th> : null}
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
                          {hasTeams ? (
                            <td data-label="Team">{r.team_name ?? "—"}</td>
                          ) : null}
                          <td data-label="Roll" style={{ color: "var(--ink-2)" }}>
                            {r.roll_no}
                          </td>
                          {round.showScore ? (
                            <td data-label="Score">{r.score ?? "—"}</td>
                          ) : null}
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
