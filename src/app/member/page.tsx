import type { Metadata } from "next";
import { requireMember } from "@/lib/member/guards";
import { memberToken } from "@/lib/attendance";
import { qrDataUrl } from "@/lib/qr";
import { getMemberAttendance } from "@/lib/admin/attendance-club";
import { istNumericDate } from "@/lib/datetime";
import { memberLogoutAction } from "./actions";

export const metadata: Metadata = { title: "My attendance", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function MemberHome() {
  const session = await requireMember();
  const [qr, view] = await Promise.all([
    qrDataUrl(`${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/m/${memberToken(session.memberId)}`),
    getMemberAttendance(session.memberId),
  ]);

  return (
    <section>
      <div className="eyebrow">{view?.clubName ?? "Club"}</div>
      <h1 style={{ margin: "10px 0 4px" }}>{session.name}</h1>
      <p className="lead" style={{ marginTop: 0 }}>Show this QR to your club head to mark attendance.</p>

      <div style={{ textAlign: "center", margin: "20px 0" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="Your attendance QR" width={240} height={240}
             style={{ width: 240, height: 240, border: "1px solid var(--rule)", borderRadius: 12, padding: 12 }} />
      </div>

      <div className="att-count" style={{ marginTop: 8 }}>
        <strong>{view?.pct ?? 0}%</strong>
        <span>{view?.attended ?? 0} of {view?.eligible ?? 0} sessions</span>
      </div>

      <h2 style={{ font: "400 18px var(--serif)", margin: "28px 0 8px" }}>History</h2>
      {!view || view.history.length === 0 ? (
        <p className="body-text" style={{ color: "var(--ink-3)" }}>No sessions yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 4 }}>
          {view.history.map((h, i) => (
            <li key={i} className="rule" style={{ paddingBottom: 8, display: "flex", justifyContent: "space-between" }}>
              <span>{h.title} · <span className="label" style={{ color: "var(--ink-3)" }}>{istNumericDate(h.at)}</span></span>
              <span style={{ color: h.present ? "var(--forest)" : "var(--rust)" }}>{h.present ? "Present" : "Absent"}</span>
            </li>
          ))}
        </ul>
      )}

      <form action={memberLogoutAction} style={{ marginTop: 32 }}>
        <button type="submit" className="btn">Log out</button>
      </form>
    </section>
  );
}
