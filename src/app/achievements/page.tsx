import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { getPublicAchievements } from "@/lib/queries";
import { renderMarkdown } from "@/lib/markdown";
import { istDateMedium } from "@/lib/datetime";

export const metadata: Metadata = {
  title: "Achievements",
  description: "Wins, awards and standout work from the department's clubs.",
};

export const dynamic = "force-dynamic";

export default async function AchievementsPage() {
  const items = await getPublicAchievements();

  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="eyebrow">Highlights</div>
      <h1 style={{ margin: "12px 0 0" }}>Achievements</h1>
      <p className="lead" style={{ marginTop: 16, maxWidth: 560 }}>
        Contest wins, hackathon podiums and the projects worth showing off — a
        running record of what the clubs have pulled off.
      </p>

      {items.length === 0 ? (
        <>
          <p className="body-text" style={{ marginTop: 24, maxWidth: 560, color: "var(--ink-3)" }}>
            We&rsquo;re gathering the highlights now. In the meantime, event results
            and standings are published per event.
          </p>
          <div className="stack" style={{ marginTop: 24, gap: 12 }}>
            <ButtonLink href="/events">Browse events</ButtonLink>
          </div>
        </>
      ) : (
        <div style={{ marginTop: 32, display: "grid", gap: 32, maxWidth: 720 }}>
          {items.map((a) => (
            <article
              key={a.id}
              className="rule"
              style={{
                display: "grid",
                gridTemplateColumns: a.imageUrl ? "160px 1fr" : "1fr",
                gap: 20,
                paddingBottom: 28,
                alignItems: "start",
              }}
            >
              {a.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.imageUrl}
                  alt=""
                  loading="lazy"
                  style={{ width: 160, height: 110, objectFit: "cover", borderRadius: 8 }}
                />
              ) : null}
              <div>
                <div className="label" style={{ color: "var(--ink-3)" }}>
                  {[a.happenedOn ? istDateMedium(a.happenedOn) : null, a.clubName]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <h2 style={{ font: "400 22px var(--serif)", margin: "4px 0 8px" }}>{a.title}</h2>
                {a.description ? (
                  <div className="prose" style={{ marginTop: 4 }}>
                    {renderMarkdown(a.description)}
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
