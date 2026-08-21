"use client";

import { useState } from "react";
import { Button } from "./ui/Button";
import { Note } from "./ui/Surface";
import { DEPARTMENTS } from "@/lib/departments";

type Result = {
  status?: string;
  error?: string;
  confirmUrl?: string;
};

const TERMINAL = new Set(["registered", "waitlisted", "duplicate"]);

export function RegisterForm({
  eventId,
  isFull,
}: {
  eventId: string;
  isFull: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      eventId,
      studentName: String(fd.get("studentName") ?? ""),
      rollNo: String(fd.get("rollNo") ?? ""),
      email: String(fd.get("email") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      department: String(fd.get("department") ?? ""),
      year: String(fd.get("year") ?? ""),
      website: String(fd.get("website") ?? ""), // honeypot
    };

    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as Result;
      setResult(res.ok ? data : { error: data.error ?? "Something went wrong.", status: data.status });
    } catch {
      setResult({ error: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  // Terminal success states hide the form.
  if (result && result.status && TERMINAL.has(result.status)) {
    return <ResultMessage result={result} />;
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {result?.error ? (
        <div className="field err" style={{ marginBottom: 14 }}>
          <span className="hint" role="alert">
            {result.error}
          </span>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="rf-name">Full name</label>
        <input id="rf-name" name="studentName" required autoComplete="name" />
      </div>
      <div className="field">
        <label htmlFor="rf-roll">Roll number</label>
        <input id="rf-roll" name="rollNo" required autoCapitalize="characters" />
        <span className="hint">Used to prevent duplicate registrations.</span>
      </div>
      <div className="field">
        <label htmlFor="rf-email">College email</label>
        <input id="rf-email" name="email" type="email" required autoComplete="email" />
        <span className="hint">We&rsquo;ll send a one-tap link to confirm your seat.</span>
      </div>
      <div className="field">
        <label htmlFor="rf-phone">Mobile number</label>
        <input id="rf-phone" name="phone" inputMode="numeric" required autoComplete="tel" />
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="rf-dept">Department</label>
          <select id="rf-dept" name="department" required defaultValue="CSE">
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ width: 96 }}>
          <label htmlFor="rf-year">Year</label>
          <select id="rf-year" name="year" required defaultValue="1">
            {[1, 2, 3, 4].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* honeypot: real users never see or fill this */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
      />

      <Button
        type="submit"
        variant="accent"
        className="w-full"
        style={{ marginTop: 4, borderRadius: "var(--r-sm)" }}
        disabled={submitting}
      >
        {submitting ? "Submitting…" : isFull ? "Join the waitlist" : "Register"}
      </Button>
      <div
        style={{
          marginTop: 10,
          textAlign: "center",
          font: "400 11.5px var(--sans)",
          color: "var(--ink-3)",
        }}
      >
        Free for all CSE students.
      </div>
    </form>
  );
}

function ResultMessage({ result }: { result: Result }) {
  if (result.status === "registered") {
    return (
      <div>
        <h3 style={{ fontSize: 22 }}>Almost there ✓</h3>
        <p className="body-text" style={{ marginTop: 8 }}>
          We&rsquo;ve emailed you a one-tap link — confirm within 30 minutes to
          lock in your seat.
        </p>
        {result.confirmUrl ? (
          <Note style={{ marginTop: 12 }}>
            Dev mode (no mail sender configured): confirm directly →{" "}
            <a href={result.confirmUrl}>confirm my seat</a>
          </Note>
        ) : null}
      </div>
    );
  }
  if (result.status === "waitlisted") {
    return (
      <div>
        <h3 style={{ fontSize: 22 }}>You&rsquo;re on the waitlist</h3>
        <p className="body-text" style={{ marginTop: 8 }}>
          This event is full — we&rsquo;ll email you if a seat opens up.
        </p>
      </div>
    );
  }
  // duplicate
  return (
    <div>
      <h3 style={{ fontSize: 22 }}>Already registered</h3>
      <p className="body-text" style={{ marginTop: 8 }}>
        This roll number is already registered for this event. Check your email
        for the confirmation link.
      </p>
    </div>
  );
}
