"use client";

import { useActionState } from "react";
import { resetPasswordAction } from "@/app/admin/reset/[token]/actions";
import { TotpEnrollFields } from "./TotpEnrollFields";
import { RecoveryCodesPanel } from "./RecoveryCodesPanel";
import type { ResetPasswordState } from "@/lib/admin/form-state";

const initial: ResetPasswordState = {};

export function ResetPasswordForm({
  token,
  email,
  qr,
  manualKey,
  encSecret,
}: {
  token: string;
  email: string;
  qr: string;
  manualKey: string;
  encSecret: string;
}) {
  const [state, action, pending] = useActionState(resetPasswordAction, initial);

  if (state.recoveryCodes) {
    return (
      <RecoveryCodesPanel
        codes={state.recoveryCodes}
        heading="Password reset"
        intro="Your old codes no longer work. Each of these works once if you lose your authenticator — store them somewhere safe, you won’t see them again."
      />
    );
  }

  return (
    <form action={action}>
      <div className="label" style={{ color: "var(--forest)" }}>
        CSE Council · Admin
      </div>
      <h1 style={{ font: "400 26px var(--serif)", margin: "8px 0 2px" }}>
        Choose a new password
      </h1>
      <p className="body-text" style={{ marginBottom: 18 }}>
        {email}
      </p>

      {state.error ? (
        <div className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>
          {state.error}
        </div>
      ) : null}

      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="secret" value={encSecret} />

      <div className="field">
        <label htmlFor="password">New password</label>
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
        {pending ? "Saving…" : "Set password and finish"}
      </button>
    </form>
  );
}
