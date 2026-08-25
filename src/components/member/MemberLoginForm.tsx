"use client";

import { useActionState } from "react";
import { memberLoginAction } from "@/app/member/login/actions";
import type { MemberLoginState } from "@/lib/admin/form-state";

const initial: MemberLoginState = {};

export function MemberLoginForm() {
  const [state, action, pending] = useActionState(memberLoginAction, initial);
  return (
    <form action={action}>
      <div className="label" style={{ color: "var(--forest)" }}>CSE Council · Member</div>
      <h1 style={{ font: "400 26px var(--serif)", margin: "8px 0 6px" }}>Sign in</h1>
      <p className="body-text" style={{ marginBottom: 18 }}>Use the login your club head set you up with.</p>
      {state.error ? <div className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>{state.error}</div> : null}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="pin">6-digit PIN</label>
        <input id="pin" name="pin" inputMode="numeric" autoComplete="off" maxLength={6} required />
      </div>
      <div className="field">
        <label htmlFor="totp">Authenticator code</label>
        <input id="totp" name="totp" inputMode="numeric" autoComplete="one-time-code" required />
      </div>
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
