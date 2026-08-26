"use client";

import { useActionState } from "react";
import { generateInviteAction } from "@/app/admin/(app)/users/actions";
import { ADMIN_ROLES } from "@/lib/auth/capabilities";
import type { InviteCreateState } from "@/lib/admin/form-state";

const initial: InviteCreateState = {};

const roleLabel = (r: string) =>
  r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function InviteForm({ clubs }: { clubs: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(generateInviteAction, initial);

  return (
    <div className="card" style={{ marginTop: 8 }}>
      <h3 style={{ marginBottom: 12 }}>Invite an admin</h3>

      {state.inviteUrl ? (
        <div className="note" style={{ marginBottom: 14 }}>
          Invite emailed to the admin (valid 48 hours). You can also copy this link to share manually:
          <br />
          <code style={{ wordBreak: "break-all", fontSize: 12 }}>{state.inviteUrl}</code>
        </div>
      ) : null}
      {state.error ? (
        <div className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 14 }}>
          {state.error}
        </div>
      ) : null}

      <form action={action}>
        <div className="admin-form-row">
          <div className="field">
            <label htmlFor="inv-email">Email</label>
            <input id="inv-email" name="email" type="email" required placeholder="vtuxxxxx@veltech.edu.in" />
          </div>
          <div className="field">
            <label htmlFor="inv-role">Role</label>
            <select id="inv-role" name="role" required defaultValue="">
              <option value="" disabled>
                Choose a role…
              </option>
              {ADMIN_ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="inv-club">Club (for club-scoped roles)</label>
          <select id="inv-club" name="clubId" defaultValue="">
            <option value="">— None —</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Creating…" : "Create invite"}
        </button>
      </form>
    </div>
  );
}
