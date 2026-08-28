import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { getClubByJoinToken } from "@/lib/admin/clubs";
import { SelfRegisterForm } from "@/components/roster/SelfRegisterForm";

export const metadata = { robots: { index: false } };

// The join flow really is a three-step sequence, so numbered markers earn their
// place here (they set expectations rather than decorate).
const STEPS = [
  "Add your details and submit.",
  "Your club head approves you.",
  "Check your attendance anytime by roll number.",
];

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const club = await getClubByJoinToken(token);
  if (!club) notFound();

  return (
    <section
      style={
        {
          maxWidth: 520,
          margin: "0 auto",
          padding: "clamp(32px, 6vw, 64px) 20px",
          // The club's own colour becomes the page's single accent (bar + steps).
          ["--club-accent" as string]: club.color,
        } as CSSProperties
      }
    >
      <span
        aria-hidden
        style={{
          display: "block",
          width: 44,
          height: 4,
          borderRadius: 99,
          background: "var(--club-accent)",
          marginBottom: 20,
        }}
      />
      <div className="eyebrow">{club.name}</div>
      <h1 style={{ margin: "8px 0 10px" }}>Join the roster</h1>
      <p className="lead" style={{ marginBottom: club.tagline ? 6 : 28 }}>
        {club.tagline ?? `Add your details to join ${club.name}'s attendance roster.`}
      </p>
      {club.tagline ? (
        <p className="body-text" style={{ marginBottom: 28 }}>
          Add your details to join {club.name}&rsquo;s attendance roster.
        </p>
      ) : null}

      <div className="panel" style={{ padding: "clamp(18px, 4vw, 24px)" }}>
        <SelfRegisterForm token={token} />
      </div>

      <ol style={{ listStyle: "none", padding: 0, margin: "26px 0 0", display: "grid", gap: 12 }}>
        {STEPS.map((step, i) => (
          <li
            key={i}
            style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "baseline" }}
          >
            <span
              aria-hidden
              style={{ font: "500 12px var(--mono)", color: "var(--club-accent)", letterSpacing: "0.08em" }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="body-text">{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
