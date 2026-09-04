import { headers } from "next/headers";
import { getMemberAttendanceByRoll } from "@/lib/admin/attendance-club";
import { checkRollLookupLimits } from "@/lib/rate-limit";
import { istNumericDate } from "@/lib/datetime";
import { ROLL_RE } from "@/lib/roster/validation";

export const metadata = { title: "Check attendance", robots: { index: false } };

/**
 * One half of a student's record. Present and Absent are shown as two labelled
 * groups rather than one chronological list with a tag on every row: the
 * question a student actually has is "which ones did I miss", and answering it
 * from an interleaved list means reading every row.
 *
 * The rows therefore carry no Present/Absent word of their own — the heading
 * above them says it once.
 *
 * ⚠️ Styles are explicit here rather than `className="hint"`: `.hint` is only
 * defined as `.field .hint`, so outside a form field it renders unstyled.
 */
function SessionGroup({
  label,
  tone,
  sessions,
}: {
  label: string;
  tone: "present" | "absent";
  sessions: { title: string; date: string }[];
}) {
  return (
    <section style={{ marginTop: 22 }}>
      <h3
        className="label"
        style={{
          display: "block",
          // Green for what they made; deliberately neutral for what they missed.
          // This page is read by students, and grey states the fact without
          // colouring it as a failure.
          color: tone === "present" ? "var(--forest)" : "var(--ink-3)",
        }}
      >
        {label} · {sessions.length}
      </h3>
      <ul style={{ listStyle: "none", padding: 0, margin: "4px 0 0" }}>
        {sessions.map((s, i) => (
          <li
            key={i}
            className="rule"
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "baseline",
              padding: "10px 0",
            }}
          >
            <span className="body-text" style={{ minWidth: 0 }}>
              {s.title}
            </span>
            <span
              style={{ flex: "none", font: "400 12px var(--sans)", color: "var(--ink-3)" }}
            >
              {istNumericDate(s.date)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** An empty group is replaced by its sentence — never an "Absent · 0" heading. */
function GroupNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="body-text" style={{ marginTop: 22, color: "var(--ink-2)" }}>
      {children}
    </p>
  );
}

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

  const history = result?.status === "active" ? result.history : [];
  const present = history.filter((h) => h.present);
  const absent = history.filter((h) => !h.present);

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "clamp(32px, 6vw, 64px) 20px" }}>
      <div className="eyebrow">CSE Council</div>
      <h1 style={{ margin: "8px 0 10px" }}>Check your attendance</h1>
      <p className="lead" style={{ marginBottom: 24 }}>
        Enter your roll number to see which sessions you attended and which you missed.
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

          {history.length === 0 ? (
            <GroupNote>
              No sessions yet — your club hasn&rsquo;t taken attendance since you joined.
            </GroupNote>
          ) : (
            <>
              {present.length > 0 ? (
                <SessionGroup label="Present" tone="present" sessions={present} />
              ) : (
                <GroupNote>You haven&rsquo;t attended a session yet.</GroupNote>
              )}
              {absent.length > 0 ? (
                <SessionGroup label="Absent" tone="absent" sessions={absent} />
              ) : (
                <GroupNote>You haven&rsquo;t missed a session.</GroupNote>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
