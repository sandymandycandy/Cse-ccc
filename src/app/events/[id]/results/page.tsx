import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel } from "@/components/ui/Surface";
import { getEventDetail, getPublishedResults } from "@/lib/queries";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const event = await getEventDetail(id);
  return { title: event ? `Results — ${event.title}` : "Results" };
}

const thStyle: React.CSSProperties = {
  padding: "6px 14px 6px 0",
  font: "500 10.5px var(--mono)",
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
};
const tdStyle: React.CSSProperties = { padding: "8px 14px 8px 0" };

export default async function EventResultsPage({ params }: Params) {
  const { id } = await params;
  const [event, rounds] = await Promise.all([
    getEventDetail(id),
    getPublishedResults(id),
  ]);
  if (!event) notFound();

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
          {rounds.map((round) => (
            <Panel key={round.id}>
              <div className="label">{round.name}</div>
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    marginTop: 12,
                    borderCollapse: "collapse",
                    font: "400 14px var(--sans)",
                    color: "var(--ink)",
                  }}
                >
                  <thead>
                    <tr style={{ textAlign: "left" }}>
                      <th style={thStyle}>Rank</th>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Roll</th>
                      <th style={thStyle}>Score</th>
                      <th style={{ ...thStyle, paddingRight: 0 }}>Advanced</th>
                    </tr>
                  </thead>
                  <tbody>
                    {round.results.map((r) => (
                      <tr key={r.roll_no} style={{ borderTop: "1px solid var(--line-2)" }}>
                        <td style={tdStyle}>{r.rank ?? "—"}</td>
                        <td style={tdStyle}>{r.display_name ?? "—"}</td>
                        <td style={{ ...tdStyle, color: "var(--ink-2)" }}>{r.roll_no}</td>
                        <td style={tdStyle}>{r.score ?? "—"}</td>
                        <td style={{ ...tdStyle, paddingRight: 0, color: "var(--forest)" }}>
                          {r.advanced ? "✓" : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </section>
  );
}
