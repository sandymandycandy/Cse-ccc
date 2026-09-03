"use client";

import { useActionState, useEffect, useState } from "react";
import { loginAction } from "./actions";
import { lockoutMessage } from "@/lib/auth/lockout";
import type { LoginState } from "@/lib/admin/form-state";

const initial: LoginState = {};

export default function AdminLoginPage() {
  const [state, action, pending] = useActionState(loginAction, initial);
  const [useRecovery, setUseRecovery] = useState(false);
  // The lockout is held as a wall-clock DEADLINE, not a decrementing counter,
  // so a backgrounded tab (where timers are throttled) still re-enables at the
  // right moment instead of drifting late.
  //
  // `locked` and `lockedFor` are DERIVED, never stored: the form must disable on
  // the very render that carries the lockout, and both of the obvious ways to
  // seed state are banned here — `Date.now()` during render is impure
  // (`react-hooks/purity`) and setState in an effect body trips
  // `react-hooks/set-state-in-effect`. So the effect below only subscribes to
  // the clock; every value the UI reads is computed from `state` + that tick.
  const [tick, setTick] = useState<{ from: LoginState; left: number } | null>(null);
  const ticked = tick?.from === state ? tick : null;
  const locked = Boolean(state.retryAfterSeconds) && ticked?.left !== 0;
  const lockedFor = ticked ? ticked.left : (state.retryAfterSeconds ?? 0);

  // `state` is a fresh object on every submit, so keying the tick on its
  // identity re-syncs even when two consecutive lockouts report the same
  // number of seconds.
  useEffect(() => {
    if (!state.retryAfterSeconds) return;
    const endsAt = Date.now() + state.retryAfterSeconds * 1000;
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      // Returning the previous object lets React bail out of the re-render, so
      // this ticks the display once a second, not five times.
      setTick((prev) =>
        prev?.from === state && prev.left === left ? prev : { from: state, left },
      );
      if (left === 0) clearInterval(timer);
    }, 200);
    return () => clearInterval(timer);
  }, [state]);

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

        {locked || state.error ? (
          <div
            role="alert"
            aria-live="polite"
            className="note"
            style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}
          >
            {locked ? lockoutMessage(lockedFor) : state.error}
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" required placeholder="vtuxxxxx@veltech.edu.in" />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="Your password"
          />
        </div>

        {useRecovery ? (
          <div className="field">
            <label htmlFor="recoveryCode">Recovery code</label>
            <input id="recoveryCode" name="recoveryCode" autoComplete="one-time-code" placeholder="xxxxx-xxxxx" />
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

        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={pending || locked}
        >
          {locked ? `Locked — ${lockedFor}s` : pending ? "Signing in…" : "Sign in"}
        </button>

        <button
          type="button"
          className="admin-auth-alt"
          onClick={() => setUseRecovery((v) => !v)}
        >
          {useRecovery ? "Use authenticator code" : "Use a recovery code"}
        </button>

        <a href="/admin/forgot" className="admin-auth-alt">
          Forgot your password?
        </a>
      </form>
    </main>
  );
}
