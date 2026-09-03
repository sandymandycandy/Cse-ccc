"use client";

import { useActionState } from "react";
import { acceptInviteAction } from "@/app/admin/accept-invite/actions";
import { TotpEnrollFields } from "./TotpEnrollFields";
import { RecoveryCodesPanel } from "./RecoveryCodesPanel";
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
      <RecoveryCodesPanel
        codes={state.recoveryCodes}
        heading="You’re all set"
        intro="Each code works once if you lose your authenticator. Store them somewhere safe — you won’t see them again."
      />
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
        <input id="name" name="name" required autoComplete="name" placeholder="Your full name" />
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="At least 12 characters"
        />
        <span className="hint">At least 12 characters, not a known-breached password.</span>
      </div>

      <TotpEnrollFields qr={qr} manualKey={manualKey} />

      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Setting up…" : "Create account"}
      </button>
    </form>
  );
}
