"use client";

import { useActionState } from "react";
import { memberSetupAction } from "@/app/member/accept-invite/actions";
import type { MemberSetupState } from "@/lib/admin/form-state";

const initial: MemberSetupState = {};

export function MemberSetupForm({
  token, qr, manualKey, encSecret,
}: { token: string; qr: string; manualKey: string; encSecret: string }) {
  const [state, action, pending] = useActionState(memberSetupAction, initial);
  return (
    <form action={action}>
      <div className="label" style={{ color: "var(--forest)" }}>CSE Council · Member</div>
      <h1 style={{ font: "400 26px var(--serif)", margin: "8px 0 2px" }}>Set up your login</h1>
      <p className="body-text" style={{ marginBottom: 18 }}>Choose a PIN and add an authenticator app.</p>

      {state.error ? <div className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>{state.error}</div> : null}

      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="secret" value={encSecret} />

      <div className="field">
        <label htmlFor="pin">6-digit PIN</label>
        <input id="pin" name="pin" inputMode="numeric" autoComplete="off" maxLength={6} required />
        <span className="hint">You&rsquo;ll enter this each time you sign in.</span>
      </div>

      <div className="enroll">
        <div className="label" style={{ marginBottom: 8 }}>Authenticator app</div>
        <p className="body-text" style={{ fontSize: 12.5, marginBottom: 10 }}>
          Scan with Google Authenticator, Authy, 1Password…
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="Authenticator QR code" width={180} height={180} className="enroll-qr" />
        <div className="hint" style={{ marginTop: 8 }}>Can&rsquo;t scan? Enter this key: <code>{manualKey}</code></div>
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="totp">6-digit code from the app</label>
        <input id="totp" name="totp" inputMode="numeric" autoComplete="one-time-code" required />
      </div>

      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Setting up…" : "Finish setup"}
      </button>
    </form>
  );
}
