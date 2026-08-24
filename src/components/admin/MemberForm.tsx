"use client";

import { useActionState } from "react";
import type { MemberFormState } from "@/lib/admin/form-state";

type MemberAction = (prev: MemberFormState, formData: FormData) => Promise<MemberFormState>;
const initialState: MemberFormState = {};

export interface MemberInitial {
  name: string;
  rollNo: string;
  role: "head" | "vice_head" | "member";
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
    <form action={formAction} style={{ marginTop: 20, maxWidth: 560 }}>
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {state.error ? (
        <div className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>{state.error}</div>
      ) : null}
      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" required maxLength={120} defaultValue={initial?.name} />
      </div>
      <div className="field">
        <label htmlFor="rollNo">Roll number (optional)</label>
        <input id="rollNo" name="rollNo" maxLength={40} defaultValue={initial?.rollNo} />
      </div>
      <div className="field">
        <label htmlFor="role">Role</label>
        <select id="role" name="role" defaultValue={initial?.role ?? "member"}>
          <option value="member">Member</option>
          <option value="vice_head">Vice Head</option>
          <option value="head">Head</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="sort">Sort order</label>
        <input id="sort" name="sort" type="number" min={0} max={9999} defaultValue={initial?.sort ?? 0} style={{ maxWidth: 120 }} />
      </div>
      {clubs ? (
        <div className="field">
          <label htmlFor="clubId">Club</label>
          <select id="clubId" name="clubId" defaultValue={initial?.clubId ?? ""}>
            <option value="" disabled>Choose a club…</option>
            {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
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
