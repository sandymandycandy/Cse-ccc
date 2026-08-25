import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { verifyMemberToken } from "@/lib/attendance";
import { getMemberAttendance } from "@/lib/admin/attendance-club";
import { istNumericDate } from "@/lib/datetime";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My attendance", robots: { index: false } };

export default async function MemberSelfView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // decodeURIComponent throws URIError on malformed input (e.g. "/m/%") — treat
  // any undecodable/invalid token as a 404, never a 500.
  let memberId: string | null = null;
  try {
    memberId = verifyMemberToken(decodeURIComponent(token));
  } catch {
    /* malformed token → memberId stays null → 404 below */
  }
  if (!memberId) notFound();
  const view = await getMemberAttendance(memberId);
  if (!view) notFound();

  return (
    <section className="section" style={{ paddingTop: 56, maxWidth: 560 }}>
      <div className="eyebrow">{view.clubName ?? "Club"}</div>
      <h1 style={{ margin: "12px 0 0" }}>{view.name}</h1>
      <p className="lead" style={{ marginTop: 8 }}>Your attendance</p>

      <div className="att-count" style={{ marginTop: 20 }}>
        <strong>{view.pct}%</strong><span>{view.attended} of {view.eligible} sessions</span>
      </div>

      <h2 style={{ font: "400 18px var(--serif)", margin: "28px 0 8px" }}>History</h2>
      {view.history.length === 0 ? <p className="body-text" style={{ color: "var(--ink-3)" }}>No sessions yet.</p> : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 4 }}>
          {view.history.map((h, i) => (
            <li key={i} className="rule" style={{ paddingBottom: 8, display: "flex", justifyContent: "space-between" }}>
              <span>{h.title} · <span className="label" style={{ color: "var(--ink-3)" }}>{istNumericDate(h.at)}</span></span>
              <span style={{ color: h.present ? "var(--forest)" : "var(--rust)" }}>{h.present ? "Present" : "Absent"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
