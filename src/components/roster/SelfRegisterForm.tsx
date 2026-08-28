"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type FieldKey = "name" | "email" | "roll" | "phone";
type FieldErrors = Partial<Record<FieldKey, string>>;

export function SelfRegisterForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const fd = new FormData(e.currentTarget);
    fd.set("token", token);
    const res = await fetch("/api/roster/register", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      router.push(`/attendance?roll=${json.roll}&new=1`);
      return;
    }
    // A 400 carries per-field messages — show them inline so the person knows
    // exactly what to fix (the mismatched-email case is the common one). Only
    // fall back to the banner for whole-form failures (bad link, rate limit…).
    const fields = json.fields && typeof json.fields === "object" ? (json.fields as FieldErrors) : {};
    if (Object.keys(fields).length > 0) setFieldErrors(fields);
    else setError(json.error ?? "Something went wrong. Try again.");
  }

  // Row keeps the design system's `.field.err` treatment (rust border + hint).
  // The hint shows the error when present, otherwise an optional standing helper.
  const rowClass = (k: FieldKey) => "field" + (fieldErrors[k] ? " err" : "");
  const hint = (field: FieldKey, help?: string) => {
    const text = fieldErrors[field] ?? help;
    return text ? (
      <span id={`${field}-hint`} className="hint">
        {text}
      </span>
    ) : null;
  };
  const describedBy = (k: FieldKey, hasHelp = false) =>
    fieldErrors[k] || hasHelp ? `${k}-hint` : undefined;

  return (
    <form onSubmit={onSubmit} noValidate style={{ display: "grid", gap: 14 }}>
      {error ? (
        <div className="note" role="alert" style={{ borderLeftColor: "var(--rust)" }}>
          {error}
        </div>
      ) : null}
      <div className={rowClass("name")} style={{ margin: 0 }}>
        <label htmlFor="name">Full name</label>
        <input
          id="name"
          name="name"
          required
          maxLength={120}
          placeholder="Your full name"
          autoComplete="name"
          aria-invalid={!!fieldErrors.name}
          aria-describedby={describedBy("name")}
        />
        {hint("name")}
      </div>
      <div className={rowClass("email")} style={{ margin: 0 }}>
        <label htmlFor="email">College email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="vtu12345@veltech.edu.in"
          autoComplete="email"
          aria-invalid={!!fieldErrors.email}
          aria-describedby={describedBy("email", true)}
        />
        {hint("email", "Use your Vel Tech email — the digits must match your roll number.")}
      </div>
      {/* The two short numeric fields sit side by side on a roomy screen and
          stack once the column gets narrow (auto-fit collapses below ~150px). */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
        <div className={rowClass("roll")} style={{ margin: 0 }}>
          <label htmlFor="roll">VTU roll number</label>
          <input
            id="roll"
            name="roll"
            required
            inputMode="numeric"
            pattern="\d{5}"
            maxLength={5}
            placeholder="12345"
            aria-invalid={!!fieldErrors.roll}
            aria-describedby={describedBy("roll")}
          />
          {hint("roll")}
        </div>
        <div className={rowClass("phone")} style={{ margin: 0 }}>
          <label htmlFor="phone">Phone</label>
          <input
            id="phone"
            name="phone"
            required
            inputMode="numeric"
            pattern="\d{10}"
            maxLength={10}
            placeholder="9876543210"
            autoComplete="tel"
            aria-invalid={!!fieldErrors.phone}
            aria-describedby={describedBy("phone")}
          />
          {hint("phone")}
        </div>
      </div>
      <button className="btn btn-primary" disabled={busy} style={{ width: "100%", marginTop: 2 }}>
        {busy ? "Submitting…" : "Join roster"}
      </button>
    </form>
  );
}
