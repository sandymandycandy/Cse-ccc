import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { Podium } from "@/components/Podium";
import { getAchievementsBoard } from "@/lib/queries";
import { renderMarkdown } from "@/lib/markdown";
import { istDateMedium } from "@/lib/datetime";

export const metadata: Metadata = {
  title: "Achievements",
  description: "Prize winners, contest wins and standout work from the department's clubs.",
};

export const dynamic = "force-dynamic";

export default async function AchievementsPage() {
  const entries = await getAchievementsBoard();

  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="eyebrow">Highlights</div>
      <h1 style={{ margin: "12px 0 0" }}>Achievements</h1>
      <p className="lead" style={{ marginTop: 16, maxWidth: 560 }}>
        Contest wins, hackathon podiums and the projects worth showing off — a
        running record of what the clubs have pulled off.
      </p>

      {entries.length === 0 ? (
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
          {entries.map((e) => (
            <article key={`${e.kind}-${e.id}`} className="rule" style={{ paddingBottom: 28 }}>
              <div className="label" style={{ color: "var(--ink-3)" }}>
                {[e.date ? istDateMedium(e.date) : null, e.clubName]
                  .filter(Boolean)
                  .join(" · ")}
              </div>

              <h2 style={{ margin: "6px 0 0", font: "400 24px/1.2 var(--serif)" }}>
                {e.title}
              </h2>

              {e.imageUrl ? (
                <Image
                  src={e.imageUrl}
                  alt=""
                  loading="lazy"
                  width={160}
                  height={110}
                  sizes="160px"
                  style={{ width: 160, height: 110, objectFit: "cover", borderRadius: 8, marginTop: 12 }}
                />
              ) : null}

              <Podium winners={e.winners} />

              {e.description ? (
                <div className="prose" style={{ marginTop: 14 }}>
                  {renderMarkdown(e.description)}
                </div>
              ) : null}

              {e.href ? (
                <Link
                  href={e.href}
                  className="label"
                  style={{ color: "var(--forest)", display: "inline-block", marginTop: 12 }}
                >
                  Full standings →
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
