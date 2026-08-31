import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { getCouncilByJoinToken } from "@/lib/admin/attendance-council";
import { CouncilRegisterForm } from "@/components/roster/CouncilRegisterForm";

export const metadata = { robots: { index: false } };

const STEPS = [
  "Add your details and submit.",
  "The president or VP approves you.",
  "You'll be marked at council meetings.",
];

export default async function CouncilJoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const council = await getCouncilByJoinToken(token);
  if (!council) notFound();

  return (
    <section
      style={
        {
          maxWidth: 520,
          margin: "0 auto",
          padding: "clamp(32px, 6vw, 64px) 20px",
          ["--club-accent" as string]: "var(--forest)",
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
      <div className="eyebrow">CSE Council</div>
      <h1 style={{ margin: "8px 0 10px" }}>Join the council roster</h1>
      <p className="lead" style={{ marginBottom: 28 }}>
        Add your details to join the council attendance roster.
      </p>

      <div className="panel" style={{ padding: "clamp(18px, 4vw, 24px)" }}>
        <CouncilRegisterForm token={token} />
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
