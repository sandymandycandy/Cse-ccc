"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SelfRegisterForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("token", token);
    const res = await fetch("/api/roster/register", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { router.push(`/attendance?roll=${json.roll}&new=1`); return; }
    setError(json.error ?? "Something went wrong.");
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, maxWidth: 460 }}>
      {error ? <div className="note" style={{ borderLeftColor: "var(--rust)" }}>{error}</div> : null}
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="name">Full name</label>
        <input id="name" name="name" required maxLength={120} placeholder="Your full name" />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="roll">VTU roll number</label>
        <input id="roll" name="roll" required inputMode="numeric" pattern="\d{5}" maxLength={5} placeholder="12345" />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="email">College email</label>
        <input id="email" name="email" type="email" required placeholder="vtu12345@veltech.edu.in" />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="phone">Phone (10 digits)</label>
        <input id="phone" name="phone" required inputMode="numeric" pattern="\d{10}" maxLength={10} placeholder="9876543210" />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="photo">Passport photo (≤ 200 KB)</label>
        <input id="photo" name="photo" type="file" accept="image/png,image/jpeg,image/webp" required />
      </div>
      <button className="btn btn-primary" disabled={busy} style={{ justifySelf: "start" }}>
        {busy ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}
