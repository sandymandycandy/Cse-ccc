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
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "clamp(32px, 6vw, 64px) 20px" }}>
      <div className="eyebrow">CSE Council</div>
      <h1 style={{ margin: "8px 0 10px" }}>Check your attendance</h1>
      <p className="lead" style={{ marginBottom: 24 }}>
        Enter your roll number to see your attendance percentage and session history.
      </p>

      {isNew ? (
        <div className="note" style={{ marginBottom: 20 }}>
          You&rsquo;re registered — awaiting approval by your club head.
        </div>
      ) : null}

      <div className="panel" style={{ padding: "clamp(18px, 4vw, 24px)" }}>
        <form method="get" style={{ display: "grid", gap: 12 }}>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="roll">Roll number</label>
            <input
              id="roll"
              name="roll"
              inputMode="numeric"
              pattern="\d{5}"
              maxLength={5}
              defaultValue={roll}
              placeholder="Your 5-digit roll"
            />
          </div>
          <button className="btn btn-primary" style={{ width: "100%" }}>
            Check attendance
          </button>
        </form>
      </div>

      {notice ? (
        <p className="body-text" style={{ marginTop: 16, color: "var(--ink-2)" }}>{notice}</p>
      ) : null}
      {roll && !notice && !result ? (
        <p className="body-text" style={{ marginTop: 16, color: "var(--ink-2)" }}>
          No attendance record for that roll number.
        </p>
      ) : null}
      {result?.status === "pending" ? (
        <p className="body-text" style={{ marginTop: 16 }}>
          {result.name} — registration pending approval by {result.clubName ?? "your club"}.
        </p>
      ) : null}
      {result?.status === "active" ? (
        <div className="card" style={{ marginTop: 20, padding: "clamp(18px, 4vw, 24px)" }}>
          <div className="eyebrow">{result.clubName ?? "—"}</div>
          <h2 style={{ font: "400 22px var(--serif)", margin: "4px 0 0" }}>{result.name}</h2>
          <div className="att-count" style={{ margin: "18px 0" }}>
            <strong>{result.pct}%</strong>
            <span>{result.attended} of {result.eligible} sessions</span>
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {result.history.map((h, i) => (
              <li
                key={i}
                className="rule"
                style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", padding: "10px 0" }}
              >
                <span className="body-text" style={{ minWidth: 0 }}>{h.title} · {istNumericDate(h.date)}</span>
                <span
                  style={{
                    flex: "none",
                    font: "500 11px var(--mono)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: h.present ? "var(--forest)" : "var(--ink-3)",
                  }}
                >
                  {h.present ? "Present" : "Absent"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
