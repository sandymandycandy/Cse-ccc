import { headers } from "next/headers";
import { getMemberAttendanceByRoll } from "@/lib/admin/attendance-club";
import { checkRollLookupLimits } from "@/lib/rate-limit";
import { istNumericDate } from "@/lib/datetime";
import { ROLL_RE } from "@/lib/roster/validation";

export const metadata = { title: "Check attendance", robots: { index: false } };

export default async function AttendanceLookup({ searchParams }: { searchParams: Promise<{ roll?: string; new?: string }> }) {
  const { roll, new: isNew } = await searchParams;
  let result: Awaited<ReturnType<typeof getMemberAttendanceByRoll>> | null = null;
  let notice: string | null = null;

  if (roll && ROLL_RE.test(roll)) {
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (checkRollLookupLimits(ip).ok) result = await getMemberAttendanceByRoll(roll);
    else notice = "Too many lookups. Please try again in a few minutes.";
  } else if (roll) {
    notice = "Enter a 5-digit roll number.";
  }

  return (
    <main className="container" style={{ maxWidth: 560, padding: "48px 20px" }}>
      <div className="eyebrow">CSE Council</div>
      <h1 style={{ margin: "6px 0 16px" }}>Check your attendance</h1>
      {isNew ? <div className="note" style={{ marginBottom: 16 }}>You&rsquo;re registered — awaiting approval by your club head.</div> : null}
      <form method="get" style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input name="roll" inputMode="numeric" pattern="\d{5}" maxLength={5} defaultValue={roll} placeholder="Your 5-digit roll" style={{ maxWidth: 220 }} />
        <button className="btn btn-primary">Check</button>
      </form>
      {notice ? <p className="body-text" style={{ color: "var(--ink-2)" }}>{notice}</p> : null}
      {roll && !notice && !result ? <p className="body-text" style={{ color: "var(--ink-2)" }}>No attendance record for that roll number.</p> : null}
      {result?.status === "pending" ? (
        <p className="body-text">{result.name} — registration pending approval by {result.clubName ?? "your club"}.</p>
      ) : null}
      {result?.status === "active" ? (
        <section>
          <h2 style={{ font: "400 20px var(--serif)", margin: "0 0 4px" }}>{result.name}</h2>
          <p className="body-text" style={{ color: "var(--ink-2)" }}>{result.clubName ?? "—"}</p>
          <div className="att-count" style={{ margin: "16px 0" }}>
            <strong>{result.pct}%</strong><span>{result.attended} of {result.eligible} sessions</span>
          </div>
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 4 }}>
            {result.history.map((h, i) => (
              <li key={i} className="rule" style={{ display: "flex", justifyContent: "space-between", paddingBottom: 6 }}>
                <span>{h.title} · {istNumericDate(h.date)}</span>
                <span style={{ color: h.present ? "var(--forest)" : "var(--ink-3)" }}>{h.present ? "Present" : "Absent"}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
