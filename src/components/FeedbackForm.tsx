"use client";

import { useRef, useState } from "react";
import { Button } from "./ui/Button";
import type { ClubOption } from "@/lib/feedback/data";
import {
  validateFeedbackDraft,
  type FeedbackFieldErrors,
} from "@/lib/feedback/form-validation";

type Result = { ok?: boolean; error?: string; fields?: Record<string, string> };

/** What each point on the scale means. An unlabelled scale produces mushy data:
 *  a 3 from someone who meant "fine" and a 3 from someone who meant "poor" are
 *  not the same number. */
const SCALE = ["Poor", "Weak", "Fine", "Good", "Excellent"] as const;

function Stars({
  name,
  value,
  onChange,
  describedBy,
}: {
  name: string;
  value: number | null;
  onChange: (v: number) => void;
  describedBy?: string;
}) {
  return (
    <div className="fb-rating">
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
              aria-describedby={describedBy}
            />
            <span aria-hidden="true">★</span>
            <span className="sr-only">
              {n} out of 5 — {SCALE[n - 1]}
            </span>
          </label>
        ))}
      </div>
      {/* aria-live so the meaning is announced, not just seen. */}
      <span className="fb-rating-label" aria-live="polite">
        {value == null ? "Poor → Excellent" : `${value} — ${SCALE[value - 1]}`}
      </span>
    </div>
  );
}

/** Counts up, not down: a limit only matters as you approach it. */
function Counter({ value, max }: { value: string; max: number }) {
  const n = value.trim().length;
  if (n < max * 0.8) return null;
  return (
    <span className="hint" data-near-limit={n > max ? "over" : "near"}>
      {n} / {max}
    </span>
  );
}

export function FeedbackForm({
  clubs,
  socialLead,
}: {
  clubs: ClubOption[];
  /** The council's Social Media Head, or null when the role is unresolved. */
  socialLead: { id: string; name: string } | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [clubId, setClubId] = useState("");
  const [headRating, setHeadRating] = useState<number | null>(null);
  const [viceRating, setViceRating] = useState<number | null>(null);
  const [clubRating, setClubRating] = useState<number | null>(null);
  const [socialTeamRating, setSocialTeamRating] = useState<number | null>(null);
  const [socialLeadRating, setSocialLeadRating] = useState<number | null>(null);
  const [activities, setActivities] = useState("");
  const [suggestions, setSuggestions] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FeedbackFieldErrors>({});
  const [doneFor, setDoneFor] = useState<string | null>(null);

  const club = clubs.find((c) => c.id === clubId) ?? null;
  const remaining = clubs.filter((c) => c.id !== clubId).length;

  function reset() {
    formRef.current?.reset();
    setClubId("");
    setHeadRating(null);
    setViceRating(null);
    setClubRating(null);
    setSocialTeamRating(null);
    setSocialLeadRating(null);
    setActivities("");
    setSuggestions("");
    setResult(null);
    setFieldErrors({});
    setDoneFor(null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const vtu = String(fd.get("vtu") ?? "");
    const studentName = String(fd.get("studentName") ?? "");

    // Checked here first purely to save a round trip; the server decides.
    const local = validateFeedbackDraft({
      vtu,
      studentName,
      clubId,
      clubRating,
      activities,
    });
    if (Object.keys(local).length > 0) {
      setFieldErrors(local);
      setResult(null);
      formRef.current
        ?.querySelector<HTMLElement>(".field.err input, .field.err select, .field.err textarea, .fb-block.err")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setSubmitting(true);
    setResult(null);
    setFieldErrors({});
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vtu,
          studentName,
          clubId,
          headRating,
          headComment: String(fd.get("headComment") ?? ""),
          viceRating,
          viceComment: String(fd.get("viceComment") ?? ""),
          clubRating,
          activities,
          suggestions,
          socialTeamRating,
          socialTeamComment: String(fd.get("socialTeamComment") ?? ""),
          socialLeadRating,
          socialLeadComment: String(fd.get("socialLeadComment") ?? ""),
          website: String(fd.get("website") ?? ""), // honeypot
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Result;
      if (res.ok) {
        setDoneFor(club?.name ?? null);
        setResult({ ok: true });
      } else if (data.fields && Object.keys(data.fields).length > 0) {
        setFieldErrors(data.fields as FeedbackFieldErrors);
      } else {
        setResult({ error: data.error ?? "Something went wrong. Try again." });
      }
    } catch {
      setResult({ error: "That didn't send. Check your connection and try again." });
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.ok) {
    return (
      <div className="fb-done">
        <p className="fb-done-mark" aria-hidden="true">
          ✓
        </p>
        <h2>Feedback received</h2>
        <p className="body-text">
          {doneFor ? (
            <>
              Your answers about <strong>{doneFor}</strong> have been recorded.
            </>
          ) : (
            <>Your answers have been recorded.</>
          )}{" "}
          They go to the President and Vice President, and nowhere else.
        </p>
        {remaining > 0 ? (
          <div className="stack" style={{ marginTop: 20, gap: 10 }}>
            <Button type="button" variant="accent" onClick={reset}>
              Give feedback on another club
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  const rowClass = (k: string) => "field" + (fieldErrors[k as keyof FeedbackFieldErrors] ? " err" : "");
  const err = (k: keyof FeedbackFieldErrors) =>
    fieldErrors[k] ? (
      <span className="hint" role="alert">
        {fieldErrors[k]}
      </span>
    ) : null;

  return (
    <form onSubmit={onSubmit} noValidate ref={formRef}>
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
          {err("vtu")}
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
          {err("studentName")}
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
          err("clubId")
        ) : (
          <span className="hint">The rest of the form depends on this.</span>
        )}
      </div>

      {club ? (
        <>
          {club.head ? (
            <fieldset className="fb-block">
              <legend>
                Club Head <span>· {club.head.name}</span>
              </legend>
              <Stars name="headRating" value={headRating} onChange={setHeadRating} />
              <div className="field">
                <label htmlFor="fb-head-c">
                  Anything to add? <span className="fb-opt">Optional</span>
                </label>
                <textarea
                  id="fb-head-c"
                  name="headComment"
                  rows={3}
                  maxLength={2000}
                  placeholder="What they do well, or what would help."
                />
              </div>
            </fieldset>
          ) : null}

          {club.viceHead ? (
            <fieldset className="fb-block">
              <legend>
                Vice Head <span>· {club.viceHead.name}</span>
              </legend>
              <Stars name="viceRating" value={viceRating} onChange={setViceRating} />
              <div className="field">
                <label htmlFor="fb-vice-c">
                  Anything to add? <span className="fb-opt">Optional</span>
                </label>
                <textarea
                  id="fb-vice-c"
                  name="viceComment"
                  rows={3}
                  maxLength={2000}
                  placeholder="What they do well, or what would help."
                />
              </div>
            </fieldset>
          ) : null}

          <fieldset className={"fb-block" + (fieldErrors.clubRating ? " err" : "")}>
            <legend>The club itself</legend>
            <Stars
              name="clubRating"
              value={clubRating}
              onChange={setClubRating}
              describedBy="fb-club-rating-err"
            />
            {fieldErrors.clubRating ? (
              <span className="hint" role="alert" id="fb-club-rating-err">
                {fieldErrors.clubRating}
              </span>
            ) : null}
          </fieldset>
        </>
      ) : null}

      <div className={rowClass("activities")}>
        <label htmlFor="fb-act">The club&rsquo;s activities so far</label>
        <textarea
          id="fb-act"
          name="activities"
          required
          rows={5}
          maxLength={4000}
          value={activities}
          onChange={(e) => setActivities(e.target.value)}
          placeholder="What has worked, what hasn't, and what you'd like more of."
        />
        {fieldErrors.activities ? err("activities") : <Counter value={activities} max={4000} />}
      </div>

      {/* Council-wide, so it sits OUTSIDE the club block: the social media team
          covers every club, and a student rates it once whichever club they
          picked. Both ratings are optional, like the leader blocks. */}
      <fieldset className="fb-block">
        <legend>
          The council&rsquo;s social media <span className="fb-opt">Optional</span>
        </legend>
        <p className="hint" style={{ marginTop: -4, marginBottom: 12 }}>
          This team covers every club, not just yours.
        </p>
        <Stars name="socialTeamRating" value={socialTeamRating} onChange={setSocialTeamRating} />
        <div className="field">
          <label htmlFor="fb-social-team-c">
            Posts, reels, event coverage &mdash; anything to add?{" "}
            <span className="fb-opt">Optional</span>
          </label>
          <textarea
            id="fb-social-team-c"
            name="socialTeamComment"
            rows={3}
            maxLength={2000}
            placeholder="What they cover well, or what gets missed."
          />
        </div>
      </fieldset>

      {socialLead ? (
        <fieldset className="fb-block">
          <legend>
            Social Media Head <span>&middot; {socialLead.name}</span>
          </legend>
          <Stars name="socialLeadRating" value={socialLeadRating} onChange={setSocialLeadRating} />
          <div className="field">
            <label htmlFor="fb-social-lead-c">
              Anything to add? <span className="fb-opt">Optional</span>
            </label>
            <textarea
              id="fb-social-lead-c"
              name="socialLeadComment"
              rows={3}
              maxLength={2000}
              placeholder="What they do well, or what would help."
            />
          </div>
        </fieldset>
      ) : null}

      <div className={rowClass("suggestions")}>
        <label htmlFor="fb-sug">
          Suggestions to improve <span className="fb-opt">Optional</span>
        </label>
        <textarea
          id="fb-sug"
          name="suggestions"
          rows={4}
          maxLength={4000}
          value={suggestions}
          onChange={(e) => setSuggestions(e.target.value)}
          placeholder="One thing the council could change."
        />
        <Counter value={suggestions} max={4000} />
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
