"use client";

import { useActionState } from "react";
import { setupTotpAction } from "@/app/admin/setup-totp/actions";
import type { SetupTotpState } from "@/lib/admin/form-state";

const initial: SetupTotpState = {};

export function SetupTotpForm({
  email,
  roleLabel,
  qr,
  manualKey,
  encSecret,
}: {
  email: string;
  roleLabel: string;
  qr: string;
  manualKey: string;
  encSecret: string;
}) {
  const [state, action, pending] = useActionState(setupTotpAction, initial);

  if (state.recoveryCodes) {
    return (
      <div>
        <div className="label" style={{ color: "var(--forest)" }}>
          Two-factor enabled
        </div>
        <h1 style={{ font: "400 26px var(--serif)", margin: "8px 0 6px" }}>
          Save your recovery codes
        </h1>
        <p className="body-text" style={{ marginBottom: 14 }}>
          Each code works once if you lose your authenticator. Store them somewhere
          safe — you won&rsquo;t see them again. You&rsquo;ll now sign in again with
          your new second factor.
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
        Set up two-factor authentication
      </h1>
      <p className="body-text" style={{ marginBottom: 18 }}>
        {email} · <span style={{ textTransform: "capitalize" }}>{roleLabel}</span>
      </p>

      <p className="body-text" style={{ marginBottom: 16 }}>
        Your role requires a second factor. Enrol an authenticator to continue —
        you can&rsquo;t reach the admin area until you do.
      </p>

      {state.error ? (
        <div className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>
          {state.error}
        </div>
      ) : null}

      <input type="hidden" name="secret" value={encSecret} />

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
        <input id="totp" name="totp" inputMode="numeric" autoComplete="one-time-code" required placeholder="6-digit code" />
      </div>

      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Enabling…" : "Enable two-factor"}
      </button>
    </form>
  );
}
