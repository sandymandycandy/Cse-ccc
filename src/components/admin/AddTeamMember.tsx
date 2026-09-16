"use client";

import { useActionState, useRef, useEffect } from "react";
import type { TeamAddState } from "@/lib/admin/form-state";
import type { ClubOption } from "@/lib/admin/team";
import { FieldError, fieldClass } from "@/components/admin/FieldError";

type AddAction = (prev: TeamAddState, formData: FormData) => Promise<TeamAddState>;

const initial: TeamAddState = {};

/**
 * Add a council member by hand, for anyone who never used the /council/join link
 * — a council officer, or someone without a login.
 *
 * Collapsed behind a <details> because it is the rare action on this page: the
 * common one is editing the 27 people already listed.
 */
export function AddTeamMember({ action, clubs }: { action: AddAction; clubs: ClubOption[] }) {
  const [state, formAction, pending] = useActionState(action, initial);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the fields after a successful add, so adding six officers in a row does
  // not mean deleting the previous name each time.
  useEffect(() => {
    if (state.addedName) formRef.current?.reset();
  }, [state.addedName]);

  return (
    <details className="panel" style={{ padding: 16, borderRadius: "var(--r-md)", marginTop: 20 }}>
      <summary style={{ cursor: "pointer", fontWeight: 500 }}>Add someone manually</summary>

      <p className="body-text" style={{ marginTop: 10, color: "var(--ink-3)" }}>
        For a council officer or anyone who never used the join link. They are added{" "}
        <strong>hidden</strong> — publish them separately once their details are right.
      </p>

      <form ref={formRef} action={formAction} style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {state.error ? (
          <div className="note" style={{ borderLeftColor: "var(--rust)" }}>{state.error}</div>
        ) : null}
        {state.addedName && !pending ? (
          <div className="note" style={{ borderLeftColor: "var(--forest)" }}>
            Added <strong>{state.addedName}</strong>, hidden for now.
          </div>
        ) : null}

        <div className="admin-form-row">
          <div className={fieldClass(state.fieldErrors, "name")}>
            <label htmlFor="add-name">Name</label>
            <input id="add-name" name="name" required maxLength={120} placeholder="e.g. Sai Varun" />
            <FieldError errors={state.fieldErrors} name="name" />
          </div>
          <div className={fieldClass(state.fieldErrors, "designation")}>
            <label htmlFor="add-role">Role</label>
            <input
              id="add-role"
              name="designation"
              required
              maxLength={80}
              placeholder="e.g. Events Head"
            />
            <span className="hint">
              Spell a council office exactly — <code>President</code>,{" "}
              <code>Vice President</code>, <code>Technical Head</code>,{" "}
              <code>Events Head</code>, <code>Documentation Head</code>,{" "}
              <code>Social Media Head</code> — to place them in the leadership row.
            </span>
            <FieldError errors={state.fieldErrors} name="designation" />
          </div>
        </div>

        <div className="admin-form-row">
          <div className={fieldClass(state.fieldErrors, "clubId")}>
            <label htmlFor="add-club">Club</label>
            <select id="add-club" name="clubId" defaultValue="">
              <option value="">— none (council-wide) —</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <FieldError errors={state.fieldErrors} name="clubId" />
          </div>
          <div className={fieldClass(state.fieldErrors, "rollNo")}>
            <label htmlFor="add-roll">VTU number (optional)</label>
            <input id="add-roll" name="rollNo" maxLength={20} placeholder="vtuxxxxx" />
            <FieldError errors={state.fieldErrors} name="rollNo" />
          </div>
        </div>

        <div>
          <button type="submit" className="btn btn-sm btn-primary" disabled={pending}>
            {pending ? "Adding…" : "Add member"}
          </button>
        </div>
      </form>
    </details>
  );
}
