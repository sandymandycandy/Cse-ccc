"use client";

import { useState } from "react";
import { Button } from "./ui/Button";

type FieldErrors = Record<string, string>;
type Result = { ok?: boolean; error?: string; fields?: FieldErrors };

export function ContactForm() {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      subject: String(fd.get("subject") ?? ""),
      message: String(fd.get("message") ?? ""),
      website: String(fd.get("website") ?? ""), // honeypot
    };

    setSubmitting(true);
    setResult(null);
    setFieldErrors({});
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as Result;
      if (res.ok) {
        setResult({ ok: true });
      } else if (data.fields && Object.keys(data.fields).length > 0) {
        setFieldErrors(data.fields);
      } else {
        setResult({ error: data.error ?? "Something went wrong." });
      }
    } catch {
      setResult({ error: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.ok) {
    return (
      <div>
        <h3 style={{ fontSize: 22 }}>Message sent ✓</h3>
        <p className="body-text" style={{ marginTop: 8 }}>
          Thanks for reaching out — the council team will get back to you at the
          email you gave.
        </p>
      </div>
    );
  }

  // `.field.err` gives the design system's rust treatment; the hint carries the message.
  const rowClass = (k: string) => "field" + (fieldErrors[k] ? " err" : "");

  return (
    <form onSubmit={onSubmit} noValidate>
      {result?.error ? (
        <div className="note" role="alert" style={{ borderLeftColor: "var(--rust)", marginBottom: 14 }}>
          {result.error}
        </div>
      ) : null}

      {/* name + email pair up once the form is wide enough for two real inputs */}
      <div className="cf-row">
        <div className={rowClass("name")}>
          <label htmlFor="cf-name">Your name</label>
          <input id="cf-name" name="name" required maxLength={80} autoComplete="name" placeholder="Your full name" />
          {fieldErrors.name ? <span className="hint" role="alert">{fieldErrors.name}</span> : null}
        </div>
        <div className={rowClass("email")}>
          <label htmlFor="cf-email">Email</label>
          <input id="cf-email" name="email" type="email" required maxLength={120} autoComplete="email" placeholder="vtuxxxxx@veltech.edu.in" />
          {fieldErrors.email ? (
            <span className="hint" role="alert">{fieldErrors.email}</span>
          ) : (
            <span className="hint">We&rsquo;ll reply here.</span>
          )}
        </div>
      </div>
      <div className={rowClass("subject")}>
        <label htmlFor="cf-subject">Subject</label>
        <input id="cf-subject" name="subject" maxLength={140} placeholder="Optional — what's this about?" />
        {fieldErrors.subject ? <span className="hint" role="alert">{fieldErrors.subject}</span> : null}
      </div>
      <div className={rowClass("message")}>
        <label htmlFor="cf-message">Message</label>
        <textarea id="cf-message" name="message" required rows={6} minLength={5} maxLength={4000} placeholder="How can we help?" />
        {fieldErrors.message ? (
          <span className="hint" role="alert">{fieldErrors.message}</span>
        ) : (
          <span className="hint">At least 5 characters.</span>
        )}
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
        {submitting ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
