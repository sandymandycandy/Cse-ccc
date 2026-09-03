"use client";

import { useActionState } from "react";
import { requestResetAction } from "./actions";
import type { ForgotState } from "@/lib/admin/form-state";

const initial: ForgotState = {};

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestResetAction, initial);

  return (
    <main className="admin-auth">
      <form action={action} className="admin-auth-card">
        <div className="label" style={{ color: "var(--forest)" }}>
          CSE Council · Admin
        </div>
        <h1 style={{ font: "400 30px var(--serif)", margin: "8px 0 4px" }}>
          Forgot your password
        </h1>
        <p className="body-text" style={{ marginBottom: 20 }}>
          We&rsquo;ll email you a link to set a new one. It also re-enrols your
          authenticator, so have your phone nearby.
        </p>

        {state.message ? (
          <div role="alert" aria-live="polite" className="note" style={{ marginBottom: 16 }}>
            {state.message}
          </div>
        ) : null}

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
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            placeholder="vtuxxxxx@veltech.edu.in"
          />
        </div>

        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending ? "Sending…" : "Email me a link"}
        </button>

        <a href="/admin/login" className="admin-auth-alt">
          Back to sign in
        </a>
      </form>
    </main>
  );
}
