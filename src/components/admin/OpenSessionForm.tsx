"use client";

import { useActionState } from "react";
import { openSessionAction } from "@/app/admin/(app)/attendance/actions";
import type { SessionFormState } from "@/lib/admin/form-state";

const initial: SessionFormState = {};

export function OpenSessionForm({ clubId }: { clubId: string | null }) {
  const [state, action, pending] = useActionState(openSessionAction, initial);
  return (
    <form action={action} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      {clubId ? <input type="hidden" name="clubId" value={clubId} /> : null}
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="title">New session</label>
        <input id="title" name="title" required maxLength={140} placeholder="Weekly sync" />
      </div>
      <button className="btn btn-primary" disabled={pending}>{pending ? "Opening…" : "Open session"}</button>
      {state.error ? <div className="note" style={{ borderLeftColor: "var(--rust)", width: "100%" }}>{state.error}</div> : null}
    </form>
  );
}
