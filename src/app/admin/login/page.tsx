"use client";

import { useActionState, useState } from "react";
import { loginAction } from "./actions";
import type { LoginState } from "@/lib/admin/form-state";

const initial: LoginState = {};

export default function AdminLoginPage() {
  const [state, action, pending] = useActionState(loginAction, initial);
  const [useRecovery, setUseRecovery] = useState(false);

  return (
    <main className="admin-auth">
      <form action={action} className="admin-auth-card">
        <div className="label" style={{ color: "var(--forest)" }}>
          CSE Council · Admin
        </div>
        <h1 style={{ font: "400 30px var(--serif)", margin: "8px 0 4px" }}>Sign in</h1>
        <p className="body-text" style={{ marginBottom: 20 }}>
          Staff accounts only. Students don&rsquo;t sign in.
        </p>

        {state.error ? (
          <div
            role="alert"
            className="note"
            style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}
          >
            {state.error}
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" required />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        {useRecovery ? (
          <div className="field">
            <label htmlFor="recoveryCode">Recovery code</label>
            <input id="recoveryCode" name="recoveryCode" autoComplete="one-time-code" />
          </div>
        ) : (
          <div className="field">
            <label htmlFor="totp">Authenticator code</label>
            <input
              id="totp"
              name="totp"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6 digits — only if 2FA is enabled"
            />
          </div>
        )}

        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>

        <button
          type="button"
          className="admin-auth-alt"
          onClick={() => setUseRecovery((v) => !v)}
        >
          {useRecovery ? "Use authenticator code" : "Use a recovery code"}
        </button>
      </form>
    </main>
  );
}
