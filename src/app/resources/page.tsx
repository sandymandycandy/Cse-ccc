import type { Metadata } from "next";
import { getPublicResources, type PublicResource } from "@/lib/queries";
import { resourceKindLabel } from "@/lib/resources";

export const metadata: Metadata = {
  title: "Resources",
  description: "Guides, links and materials shared by the department's clubs.",
};

export const dynamic = "force-dynamic";

interface Group {
  key: string;
  heading: string;
  items: PublicResource[];
}

/** Council-wide first, then each club alphabetically; items keep their
 *  title order from the query. */
function group(resources: PublicResource[]): Group[] {
  const councilWide = resources.filter((r) => r.clubId == null);
  const byClub = new Map<string, Group>();
  for (const r of resources) {
    if (r.clubId == null) continue;
    const g = byClub.get(r.clubId);
    if (g) g.items.push(r);
    else byClub.set(r.clubId, { key: r.clubId, heading: r.clubName ?? "Club", items: [r] });
  }
  const clubGroups = [...byClub.values()].sort((a, b) => a.heading.localeCompare(b.heading));
  return [
    ...(councilWide.length ? [{ key: "council", heading: "Council-wide", items: councilWide }] : []),
    ...clubGroups,
  ];
}

export default async function ResourcesPage() {
  const resources = await getPublicResources();
  const groups = group(resources);

  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="eyebrow">Resources</div>
      <h1 style={{ margin: "12px 0 0" }}>Resources</h1>
      <p className="lead" style={{ marginTop: 16, maxWidth: 560 }}>
        Guides, slide decks, starter kits and useful links the clubs share —
        gathered in one place.
      </p>

      {groups.length === 0 ? (
        <p className="body-text" style={{ marginTop: 24, maxWidth: 560, color: "var(--ink-3)" }}>
          We&rsquo;re collecting these now. Check back soon.
        </p>
      ) : (
        <div style={{ marginTop: 32, display: "grid", gap: 36, maxWidth: 640 }}>
          {groups.map((g) => (
            <div key={g.key}>
              <h2 className="eyebrow" style={{ marginBottom: 12 }}>
                {g.heading}
              </h2>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 2 }}>
                {g.items.map((r) => (
                  <li key={r.id} className="rule" style={{ paddingBottom: 12 }}>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "flex",
                        gap: 12,
                        alignItems: "baseline",
                        justifyContent: "space-between",
                        color: "var(--ink)",
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>{r.title} ↗</span>
                      <span className="label" style={{ color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                        {resourceKindLabel(r.kind)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
