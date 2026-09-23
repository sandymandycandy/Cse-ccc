"use client";

import { useActionState } from "react";
import type { MemberFormState } from "@/lib/admin/form-state";
import { FieldError, fieldClass } from "@/components/admin/FieldError";

type MemberAction = (prev: MemberFormState, formData: FormData) => Promise<MemberFormState>;
const initialState: MemberFormState = {};

export interface MemberInitial {
  name: string;
  rollNo: string;
  email: string;
  phone: string;
  sort: number;
  isActive: boolean;
  clubId: string | null;
}

export function MemberForm({
  action, submitLabel = "Add member", id, initial, clubs,
}: {
  action: MemberAction;
  submitLabel?: string;
  id?: string;
  initial?: MemberInitial;
  clubs?: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="admin-content-form" style={{ marginTop: 20, maxWidth: 560 }}>
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {state.error ? (
        <div className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>{state.error}</div>
      ) : null}
      <div className={fieldClass(state.fieldErrors, "name")}>
        <label htmlFor="name">Name</label>
        <input id="name" name="name" required maxLength={120} defaultValue={initial?.name} placeholder="Member's full name" />
        <FieldError errors={state.fieldErrors} name="name" />
      </div>
      <div className={fieldClass(state.fieldErrors, "rollNo")}>
        <label htmlFor="rollNo">Roll number</label>
        <input id="rollNo" name="rollNo" required inputMode="numeric" maxLength={40} defaultValue={initial?.rollNo} placeholder="12345" />
        <FieldError errors={state.fieldErrors} name="rollNo" />
      </div>
      <div className={fieldClass(state.fieldErrors, "email")}>
        <label htmlFor="email">Email (contact)</label>
        <input id="email" name="email" type="email" maxLength={200} defaultValue={initial?.email} placeholder="vtuxxxxx@veltech.edu.in" />
        <FieldError errors={state.fieldErrors} name="email" />
      </div>
      <div className={fieldClass(state.fieldErrors, "phone")}>
        <label htmlFor="phone">Phone</label>
        <input id="phone" name="phone" required inputMode="numeric" maxLength={20} defaultValue={initial?.phone} placeholder="10-digit mobile" />
        <FieldError errors={state.fieldErrors} name="phone" />
      </div>
      <div className={fieldClass(state.fieldErrors, "sort")}>
        <label htmlFor="sort">Sort order</label>
        <input id="sort" name="sort" type="number" min={0} max={9999} defaultValue={initial?.sort ?? 0} style={{ maxWidth: 120 }} placeholder="0" />
        <FieldError errors={state.fieldErrors} name="sort" />
      </div>
      {clubs ? (
        <div className={fieldClass(state.fieldErrors, "clubId")}>
          <label htmlFor="clubId">Club</label>
          <select id="clubId" name="clubId" defaultValue={initial?.clubId ?? ""}>
            <option value="" disabled>Choose a club…</option>
            {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <FieldError errors={state.fieldErrors} name="clubId" />
        </div>
      ) : null}
      <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} style={{ width: "auto" }} />
        <span>Active (counts toward attendance)</span>
      </label>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
