"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/Button";
import { defaultFormFor, LAYOUT_KINDS, type FormField } from "@/lib/registration-form/schema";
import { shouldRetry, nextDelay, MAX_ATTEMPTS, type RetryOutcome } from "@/lib/registration/retry";
import { leaderLabel } from "@/lib/registration-form/team-labels";
import { ResultMessage } from "./registration/ResultMessage";
import { WhatsAppInvite } from "./registration/WhatsAppInvite";
import { ChoiceGroup } from "./registration/ChoiceGroup";
import { isCompactChoice } from "@/lib/registration-form/choice-display";
import { errorSummary } from "@/lib/registration-form/error-summary";

type Result = {
  status?: string;
  error?: string;
  fields?: Record<string, string>;
  position?: number | null;
  /** The event's group chat. Only ever sent back on a registration that landed. */
  whatsapp?: string | null;
};
const TERMINAL = new Set(["registered", "submitted", "waitlisted", "duplicate"]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One POST attempt, classified for the waiting-room retry loop. */
async function submitOnce(
  payload: unknown,
): Promise<{ done: true; data: Result } | { done: false; retryAfter?: number }> {
  let res: Response;
  try {
    res = await fetch("/api/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { done: false }; // network blip → retry
  }
  const data = (await res.json().catch(() => ({}))) as Result;
  const outcome: RetryOutcome = data.status
    ? { kind: "status", status: data.status }
    : { kind: "http", status: res.status };
  const ra = Number(res.headers.get("retry-after") ?? "");
  const retryAfter = Number.isFinite(ra) && ra > 0 ? ra : undefined;
  if (shouldRetry(outcome, retryAfter)) return { done: false, retryAfter };
  return {
    done: true,
    data: res.ok
      ? data
      : { error: data.error ?? "Something went wrong.", status: data.status, fields: data.fields, position: data.position },
  };
}

export function RegisterForm({
  eventId,
  schema,
  isFull,
  mode = "seats",
}: {
  eventId: string;
  schema: FormField[] | null;
  isFull: boolean;
  mode?: "seats" | "shortlist";
}) {
  const fields = schema && schema.length > 0 ? schema : defaultFormFor();
  const [submitting, setSubmitting] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [teams, setTeams] = useState<Record<string, Record<string, string>[]>>(() => {
    const init: Record<string, Record<string, string>[]> = {};
    for (const f of fields) {
      if (f.kind === "team") {
        const rows = Math.max(1, f.minMembers ?? 1);
        init[f.id] = Array.from({ length: rows }, () => ({}));
      }
    }
    return init;
  });
  const [otherText, setOtherText] = useState<Record<string, string>>({});
  // The invite pops up once per registration; dismissing it leaves the same
  // link on the success panel rather than taking it away.
  const [inviteDismissed, setInviteDismissed] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const problems = result?.fields ? errorSummary(fields, result.fields) : [];

  // A rejected answer is usually far above the Register button on a long form;
  // take the student to the first one instead of leaving the button looking dead.
  useEffect(() => {
    if (!result?.fields) return;
    const first = formRef.current?.querySelector<HTMLElement>(".field.err");
    first?.scrollIntoView({ behavior: "smooth", block: "center" });
    first?.querySelector<HTMLElement>("input, select, textarea")?.focus({ preventScroll: true });
  }, [result]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const answers: Record<string, unknown> = {};
    for (const field of fields) {
      if (LAYOUT_KINDS.has(field.kind)) continue;
      if (field.kind === "team") {
        answers[field.id] = teams[field.id] ?? [];
      } else if (field.kind === "checkboxes") {
        let vals = fd.getAll(field.id).map(String);
        if (field.allowOther && vals.includes("__other__")) {
          vals = vals.filter((v) => v !== "__other__");
          if (otherText[field.id]) vals.push(otherText[field.id]);
        }
        answers[field.id] = vals;
      } else if ((field.kind === "radio" || field.kind === "dropdown") && field.allowOther) {
        let v = String(fd.get(field.id) ?? "");
        if (v === "__other__") v = otherText[field.id] ?? "";
        answers[field.id] = v;
      } else {
        answers[field.id] = String(fd.get(field.id) ?? "");
      }
    }
    setSubmitting(true);
    setWaiting(false);
    setResult(null);
    const payload = { eventId, answers, website: String(fd.get("website") ?? "") };
    // Waiting room: retry transient failures (busy server, or "not open yet" at
    // the open tick) with backoff so nobody sees a raw error during the rush.
    let final: Result | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const r = await submitOnce(payload);
      if (r.done) {
        final = r.data;
        break;
      }
      setWaiting(true);
      await sleep(nextDelay(attempt, r.retryAfter));
    }
    setSubmitting(false);
    setWaiting(false);
    setResult(final ?? { error: "It's very busy right now. Please try again in a moment." });
  }

  if (waiting) {
    return (
      <div className="stack" style={{ gap: 8, textAlign: "center", padding: "12px 0" }}>
        <div className="label">Holding your place…</div>
        <p className="body-text">
          You&rsquo;re in line. Hang tight — this can take a moment when a lot of people register at
          once. Please don&rsquo;t close this tab.
        </p>
      </div>
    );
  }

  if (result && result.status && TERMINAL.has(result.status)) {
    return (
      <>
        <ResultMessage
          status={result.status}
          mode={mode}
          position={result.position}
          group={result.whatsapp}
        />
        {inviteDismissed ? null : (
          <WhatsAppInvite url={result.whatsapp ?? null} onClose={() => setInviteDismissed(true)} />
        )}
      </>
    );
  }

  // On a team event the person filling this in IS the team leader, so the
  // identity fields say so outright and the roster below holds only the other
  // members — otherwise the leader types their own name twice.
  const hasTeam = fields.some((f) => f.kind === "team");

  return (
    <form ref={formRef} className="rf" onSubmit={onSubmit} noValidate>
      {result?.error ? (
        <div className="field err" style={{ marginBottom: 14 }}>
          <span className="hint" role="alert">
            {result.error}
          </span>
        </div>
      ) : null}

      {fields.map((field) => {
        if (field.kind === "section") {
          return (
            <div key={field.id} style={{ marginTop: 18, marginBottom: 4 }}>
              <h3 style={{ fontSize: 18 }}>{field.label}</h3>
              {field.description ? (
                <p className="hint" style={{ marginTop: 4 }}>
                  {field.description}
                </p>
              ) : null}
            </div>
          );
        }
        if (field.kind === "team") {
          return (
            <TeamField
              key={field.id}
              field={field}
              rows={teams[field.id] ?? [{}]}
              error={result?.fields?.[field.id]}
              onChange={(rows) => setTeams((t) => ({ ...t, [field.id]: rows }))}
            />
          );
        }
        return (
          <FieldInput
            key={field.id}
            field={field}
            label={
              hasTeam && field.identity && field.identity !== "team_name"
                ? leaderLabel(field.label)
                : field.label
            }
            error={result?.fields?.[field.id]}
            otherText={otherText[field.id] ?? ""}
            onOther={(v) => setOtherText((s) => ({ ...s, [field.id]: v }))}
          />
        );
      })}

      {/* honeypot: real users never see or fill this */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
      />

      {/* Said again beside the button, where the student is looking when it fails. */}
      {result?.error ? (
        <div className="rf-problems" role="alert">
          <strong>{problems.length > 0 ? "Please fix these and register again:" : result.error}</strong>
          {problems.length > 0 ? (
            <ul>
              {problems.map((p) => (
                <li key={p.id}>{p.text}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <Button
        type="submit"
        variant="accent"
        className="w-full"
        style={{ marginTop: 4, borderRadius: "var(--r-sm)" }}
        disabled={submitting}
      >
        {submitting ? "Submitting…" : isFull ? "Join the waitlist" : mode === "shortlist" ? "Submit" : "Register"}
      </Button>
    </form>
  );
}

function FieldInput({
  field,
  label,
  error,
  otherText,
  onOther,
}: {
  field: FormField;
  /** Resolved label — the leader-prefixed one on a team event. */
  label?: string;
  error?: string;
  otherText?: string;
  onOther?: (v: string) => void;
}) {
  const id = `rf-${field.id}`;
  const common = { id, name: field.id, required: field.required } as const;
  // A choice question is a group of inputs, not one — it takes a legend.
  const compact = isCompactChoice(field);
  const isChoice = field.kind === "radio" || field.kind === "checkboxes" || compact;
  const Wrap = isChoice ? "fieldset" : "div";
  const heading = (
    <>
      {label ?? field.label}
      {field.required ? "" : " (optional)"}
    </>
  );
  return (
    <Wrap className={`field${error ? " err" : ""}`}>
      {isChoice ? <legend>{heading}</legend> : <label htmlFor={id}>{heading}</label>}
      {field.kind === "paragraph" ? (
        <textarea {...common} rows={4} maxLength={4000} />
      ) : compact ? (
        <ChoiceGroup
          name={field.id}
          type="radio"
          variant="pill"
          options={field.options ?? []}
          required={field.required}
        />
      ) : field.kind === "dropdown" ? (
        <>
          <select {...common} defaultValue="">
            <option value="" disabled>
              Choose…
            </option>
            {(field.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            {field.allowOther ? <option value="__other__">Other…</option> : null}
          </select>
          {field.allowOther ? (
            <input
              type="text"
              aria-label="Other"
              placeholder="Other (if not listed)"
              value={otherText ?? ""}
              onChange={(e) => onOther?.(e.target.value)}
              style={{ marginTop: 6 }}
            />
          ) : null}
        </>
      ) : field.kind === "radio" || field.kind === "checkboxes" ? (
        <ChoiceGroup
          name={field.id}
          type={field.kind === "radio" ? "radio" : "checkbox"}
          options={field.options ?? []}
          required={field.required}
          allowOther={field.allowOther}
          otherText={otherText}
          onOther={onOther}
        />
      ) : field.kind === "date" ? (
        <input {...common} type="date" />
      ) : field.kind === "number" ? (
        <input {...common} type="number" inputMode="numeric" />
      ) : field.kind === "link" ? (
        <input {...common} type="url" inputMode="url" placeholder="https://drive.google.com/…" />
      ) : (
        <input
          {...common}
          placeholder={
            field.identity === "email"
              ? "vtuxxxxx@veltech.edu.in"
              : field.identity === "roll"
                ? "vtuxxxxx"
                : undefined
          }
        />
      )}
      {error ? (
        <span className="hint" role="alert">
          {error}
        </span>
      ) : field.help ? (
        <span className="hint">{field.help}</span>
      ) : null}
    </Wrap>
  );
}

function TeamField({
  field,
  rows,
  error,
  onChange,
}: {
  field: FormField;
  rows: Record<string, string>[];
  error?: string;
  onChange: (rows: Record<string, string>[]) => void;
}) {
  const subs = field.members ?? [];
  const max = field.maxMembers ?? 10;
  const min = field.minMembers ?? 1;
  const setCell = (idx: number, key: string, v: string) =>
    onChange(rows.map((r, k) => (k === idx ? { ...r, [key]: v } : r)));
  const addRow = () => {
    if (rows.length < max) onChange([...rows, {}]);
  };
  const removeRow = (idx: number) => {
    if (rows.length > min) onChange(rows.filter((_, k) => k !== idx));
  };

  return (
    <div className={`field${error ? " err" : ""}`}>
      <label>
        {field.label}
        {field.required ? "" : " (optional)"}
      </label>
      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((row, idx) => {
          return (
            <div key={idx} className="card team-row">
              <div className="team-row-head">
                <span className="label">Member {idx + 1}</span>
                {rows.length > min ? (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeRow(idx)}>
                    Remove
                  </button>
                ) : null}
              </div>
              <div className="team-row-fields">
                {subs.map((sf) => (
                  <div className="field" key={sf.key} style={{ marginTop: 6 }}>
                    <label>
                      {sf.label}
                      {sf.required ? "" : " (optional)"}
                    </label>
                    <input
                      type={sf.kind === "email" ? "email" : sf.kind === "phone" ? "tel" : "text"}
                      value={row[sf.key] ?? ""}
                      onChange={(e) => setCell(idx, sf.key, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {rows.length < max ? (
        <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: 6 }} onClick={addRow}>
          + Add member
        </button>
      ) : null}
      {error ? (
        <span className="hint" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
