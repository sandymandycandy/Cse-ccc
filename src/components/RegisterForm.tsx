"use client";

import { useState } from "react";
import { Button } from "./ui/Button";
import { defaultFormFor, type FormField } from "@/lib/registration-form/schema";

type Result = { status?: string; error?: string; fields?: Record<string, string> };
const TERMINAL = new Set(["registered", "submitted", "waitlisted", "duplicate"]);

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
  const [result, setResult] = useState<Result | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const answers: Record<string, unknown> = {};
    for (const field of fields) {
      if (field.kind === "checkboxes") answers[field.id] = fd.getAll(field.id).map(String);
      else answers[field.id] = String(fd.get(field.id) ?? "");
    }
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, answers, website: String(fd.get("website") ?? "") }),
      });
      const data = (await res.json().catch(() => ({}))) as Result;
      setResult(
        res.ok
          ? data
          : { error: data.error ?? "Something went wrong.", status: data.status, fields: data.fields },
      );
    } catch {
      setResult({ error: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  if (result && result.status && TERMINAL.has(result.status)) {
    return <ResultMessage status={result.status} mode={mode} />;
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

      {fields.map((field) => (
        <FieldInput key={field.id} field={field} error={result?.fields?.[field.id]} />
      ))}

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
        {submitting ? "Submitting…" : isFull ? "Join the waitlist" : mode === "shortlist" ? "Submit" : "Register"}
      </Button>
    </form>
  );
}

function FieldInput({ field, error }: { field: FormField; error?: string }) {
  const id = `rf-${field.id}`;
  const common = { id, name: field.id, required: field.required } as const;
  return (
    <div className={`field${error ? " err" : ""}`}>
      <label htmlFor={id}>
        {field.label}
        {field.required ? "" : " (optional)"}
      </label>
      {field.kind === "paragraph" ? (
        <textarea {...common} rows={4} maxLength={4000} />
      ) : field.kind === "dropdown" ? (
        <select {...common} defaultValue="">
          <option value="" disabled>
            Choose…
          </option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : field.kind === "radio" ? (
        <div className="stack" style={{ gap: 6 }}>
          {(field.options ?? []).map((o) => (
            <label key={o} style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}>
              <input type="radio" name={field.id} value={o} required={field.required} /> {o}
            </label>
          ))}
        </div>
      ) : field.kind === "checkboxes" ? (
        <div className="stack" style={{ gap: 6 }}>
          {(field.options ?? []).map((o) => (
            <label key={o} style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}>
              <input type="checkbox" name={field.id} value={o} /> {o}
            </label>
          ))}
        </div>
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
    </div>
  );
}

function ResultMessage({ status, mode }: { status: string; mode: "seats" | "shortlist" }) {
  if (status === "registered" || status === "submitted") {
    return (
      <div>
        <h3 style={{ fontSize: 22 }}>{mode === "shortlist" ? "Submitted ✓" : "You're registered ✓"}</h3>
        <p className="body-text" style={{ marginTop: 8 }}>
          {mode === "shortlist"
            ? "Thanks — the club will review submissions and email you if you're selected."
            : "Your spot is confirmed. See you there!"}
        </p>
      </div>
    );
  }
  if (status === "waitlisted") {
    return (
      <div>
        <h3 style={{ fontSize: 22 }}>You&rsquo;re on the waitlist</h3>
        <p className="body-text" style={{ marginTop: 8 }}>
          This event is full — we&rsquo;ll email you if a seat opens up.
        </p>
      </div>
    );
  }
  return (
    <div>
      <h3 style={{ fontSize: 22 }}>Already registered</h3>
      <p className="body-text" style={{ marginTop: 8 }}>
        You&rsquo;ve already submitted this form for this event.
      </p>
    </div>
  );
}
