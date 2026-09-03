"use client";

import { useState } from "react";
import { Button } from "./ui/Button";
import type { ClubOption } from "@/lib/feedback/data";

type FieldErrors = Record<string, string>;
type Result = { ok?: boolean; error?: string; fields?: FieldErrors };

/** 1–5 radio group. Radios (not a select) so the whole scale is visible and
 *  tappable on a phone, and so "no answer" stays representable. */
function Stars({
  name,
  value,
  onChange,
}: {
  name: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="fb-stars" role="radiogroup" aria-label="Rating out of 5">
      {[1, 2, 3, 4, 5].map((n) => (
        <label
          key={n}
          className="fb-star"
          data-on={value != null && n <= value ? "true" : "false"}
        >
          <input
            type="radio"
            name={name}
            value={n}
            checked={value === n}
            onChange={() => onChange(n)}
          />
          <span aria-hidden="true">★</span>
          <span className="sr-only">{n} out of 5</span>
        </label>
      ))}
    </div>
  );
}

export function FeedbackForm({ clubs }: { clubs: ClubOption[] }) {
  const [clubId, setClubId] = useState("");
  const [headRating, setHeadRating] = useState<number | null>(null);
  const [viceRating, setViceRating] = useState<number | null>(null);
  const [clubRating, setClubRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const club = clubs.find((c) => c.id === clubId) ?? null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      vtu: String(fd.get("vtu") ?? ""),
      studentName: String(fd.get("studentName") ?? ""),
      clubId,
      headRating,
      headComment: String(fd.get("headComment") ?? ""),
      viceRating,
      viceComment: String(fd.get("viceComment") ?? ""),
      clubRating,
      activities: String(fd.get("activities") ?? ""),
      suggestions: String(fd.get("suggestions") ?? ""),
      website: String(fd.get("website") ?? ""), // honeypot
    };

    setSubmitting(true);
    setResult(null);
    setFieldErrors({});
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as Result;
      if (res.ok) setResult({ ok: true });
      else if (data.fields && Object.keys(data.fields).length > 0) setFieldErrors(data.fields);
      else setResult({ error: data.error ?? "Something went wrong." });
    } catch {
      setResult({ error: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.ok) {
    return (
      <div>
        <h3 style={{ fontSize: 22 }}>Feedback received ✓</h3>
        <p className="body-text" style={{ marginTop: 8 }}>
          Thank you — this goes straight to the President and Vice President, and
          nowhere else.
        </p>
      </div>
    );
  }

  const rowClass = (k: string) => "field" + (fieldErrors[k] ? " err" : "");

  return (
    <form onSubmit={onSubmit} noValidate>
      {result?.error ? (
        <div
          className="note"
          role="alert"
          style={{ borderLeftColor: "var(--rust)", marginBottom: 14 }}
        >
          {result.error}
        </div>
      ) : null}

      <div className="cf-row">
        <div className={rowClass("vtu")}>
          <label htmlFor="fb-vtu">VTU number</label>
          <input id="fb-vtu" name="vtu" required maxLength={20} placeholder="vtuxxxxx" />
          {fieldErrors.vtu ? (
            <span className="hint" role="alert">
              {fieldErrors.vtu}
            </span>
          ) : null}
        </div>
        <div className={rowClass("studentName")}>
          <label htmlFor="fb-name">Your name</label>
          <input
            id="fb-name"
            name="studentName"
            required
            maxLength={80}
            autoComplete="name"
            placeholder="Your full name"
          />
          {fieldErrors.studentName ? (
            <span className="hint" role="alert">
              {fieldErrors.studentName}
            </span>
          ) : null}
        </div>
      </div>

      <div className={rowClass("clubId")}>
        <label htmlFor="fb-club">Your club</label>
        <select
          id="fb-club"
          name="clubId"
          required
          value={clubId}
          onChange={(e) => setClubId(e.target.value)}
        >
          <option value="">Select your club…</option>
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {fieldErrors.clubId ? (
          <span className="hint" role="alert">
            {fieldErrors.clubId}
          </span>
        ) : null}
      </div>

      {club?.head ? (
        <fieldset className="fb-block">
          <legend>Club Head — {club.head.name}</legend>
          <Stars name="headRating" value={headRating} onChange={setHeadRating} />
          <div className="field">
            <label htmlFor="fb-head-c">Anything you&rsquo;d like to say?</label>
            <textarea
              id="fb-head-c"
              name="headComment"
              rows={3}
              maxLength={2000}
              placeholder="Optional."
            />
          </div>
        </fieldset>
      ) : null}

      {club?.viceHead ? (
        <fieldset className="fb-block">
          <legend>Vice Head — {club.viceHead.name}</legend>
          <Stars name="viceRating" value={viceRating} onChange={setViceRating} />
          <div className="field">
            <label htmlFor="fb-vice-c">Anything you&rsquo;d like to say?</label>
            <textarea
              id="fb-vice-c"
              name="viceComment"
              rows={3}
              maxLength={2000}
              placeholder="Optional."
            />
          </div>
        </fieldset>
      ) : null}

      {club ? (
        <fieldset className="fb-block">
          <legend>The club itself</legend>
          <Stars name="clubRating" value={clubRating} onChange={setClubRating} />
          {fieldErrors.clubRating ? (
            <span className="hint" role="alert">
              {fieldErrors.clubRating}
            </span>
          ) : null}
        </fieldset>
      ) : null}

      <div className={rowClass("activities")}>
        <label htmlFor="fb-act">The club&rsquo;s activities so far</label>
        <textarea
          id="fb-act"
          name="activities"
          required
          rows={5}
          maxLength={4000}
          placeholder="What has worked, what hasn't, what you'd like more of."
        />
        {fieldErrors.activities ? (
          <span className="hint" role="alert">
            {fieldErrors.activities}
          </span>
        ) : (
          <span className="hint">At least 5 characters.</span>
        )}
      </div>

      <div className={rowClass("suggestions")}>
        <label htmlFor="fb-sug">Any suggestions to improve?</label>
        <textarea
          id="fb-sug"
          name="suggestions"
          rows={4}
          maxLength={4000}
          placeholder="Optional."
        />
        {fieldErrors.suggestions ? (
          <span className="hint" role="alert">
            {fieldErrors.suggestions}
          </span>
        ) : null}
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
        className="cf-submit"
        style={{ marginTop: 4, borderRadius: "var(--r-sm)" }}
        disabled={submitting}
      >
        {submitting ? "Sending…" : "Send feedback"}
      </Button>
    </form>
  );
}
