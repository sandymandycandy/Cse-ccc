"use client";

import { useState } from "react";
import { Button } from "./ui/Button";

type Result = { ok?: boolean; error?: string };

export function ContactForm() {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

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
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as Result;
      setResult(res.ok ? { ok: true } : { error: data.error ?? "Something went wrong." });
    } catch {
      setResult({ error: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.ok) {
    return (
      <div style={{ maxWidth: 560 }}>
        <h3 style={{ fontSize: 22 }}>Message sent ✓</h3>
        <p className="body-text" style={{ marginTop: 8 }}>
          Thanks for reaching out — the council team will get back to you at the
          email you gave.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate style={{ maxWidth: 560 }}>
      {result?.error ? (
        <div className="field err" style={{ marginBottom: 14 }}>
          <span className="hint" role="alert">
            {result.error}
          </span>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="cf-name">Your name</label>
        <input id="cf-name" name="name" required maxLength={80} autoComplete="name" placeholder="Your full name" />
      </div>
      <div className="field">
        <label htmlFor="cf-email">Email</label>
        <input id="cf-email" name="email" type="email" required maxLength={120} autoComplete="email" placeholder="vtuxxxxx@veltech.edu.in" />
        <span className="hint">We&rsquo;ll reply here.</span>
      </div>
      <div className="field">
        <label htmlFor="cf-subject">Subject</label>
        <input id="cf-subject" name="subject" maxLength={140} placeholder="Optional — what's this about?" />
      </div>
      <div className="field">
        <label htmlFor="cf-message">Message</label>
        <textarea id="cf-message" name="message" required rows={6} minLength={10} maxLength={4000} placeholder="How can we help?" />
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
        style={{ marginTop: 4, borderRadius: "var(--r-sm)" }}
        disabled={submitting}
      >
        {submitting ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
