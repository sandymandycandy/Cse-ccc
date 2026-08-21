"use client";

import { useActionState } from "react";
import { acceptInviteAction } from "@/app/admin/accept-invite/actions";
import type { AcceptInviteState } from "@/lib/admin/form-state";

const initial: AcceptInviteState = {};

export function AcceptInviteForm({
  token,
  email,
  roleLabel,
  qr,
  manualKey,
  encSecret,
}: {
  token: string;
  email: string;
  roleLabel: string;
  qr: string;
  manualKey: string;
  encSecret: string;
}) {
  const [state, action, pending] = useActionState(acceptInviteAction, initial);

  if (state.recoveryCodes) {
    return (
      <div>
        <div className="label" style={{ color: "var(--forest)" }}>
          You&rsquo;re all set
        </div>
        <h1 style={{ font: "400 26px var(--serif)", margin: "8px 0 6px" }}>
          Save your recovery codes
        </h1>
        <p className="body-text" style={{ marginBottom: 14 }}>
          Each code works once if you lose your authenticator. Store them somewhere
          safe — you won&rsquo;t see them again.
        </p>
        <ul className="recovery-codes">
          {state.recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <a href="/admin/login" className="btn btn-primary w-full" style={{ marginTop: 16 }}>
          Go to sign in
        </a>
      </div>
    );
  }

  return (
    <form action={action}>
      <div className="label" style={{ color: "var(--forest)" }}>
        CSE Council · Admin
      </div>
      <h1 style={{ font: "400 26px var(--serif)", margin: "8px 0 2px" }}>
        Set up your account
      </h1>
      <p className="body-text" style={{ marginBottom: 18 }}>
        {email} · <span style={{ textTransform: "capitalize" }}>{roleLabel}</span>
      </p>

      {state.error ? (
        <div className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>
          {state.error}
        </div>
      ) : null}

      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="secret" value={encSecret} />

      <div className="field">
        <label htmlFor="name">Full name</label>
        <input id="name" name="name" required autoComplete="name" />
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
        />
        <span className="hint">At least 12 characters, not a known-breached password.</span>
      </div>

      <div className="enroll">
        <div className="label" style={{ marginBottom: 8 }}>
          Two-factor authentication
        </div>
        <p className="body-text" style={{ fontSize: 12.5, marginBottom: 10 }}>
          Scan this with an authenticator app (Google Authenticator, Authy, 1Password…).
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="Authenticator QR code" width={180} height={180} className="enroll-qr" />
        <div className="hint" style={{ marginTop: 8 }}>
          Can&rsquo;t scan? Enter this key: <code>{manualKey}</code>
        </div>
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="totp">6-digit code from the app</label>
        <input id="totp" name="totp" inputMode="numeric" autoComplete="one-time-code" required />
      </div>

      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Setting up…" : "Create account"}
      </button>
    </form>
  );
}
