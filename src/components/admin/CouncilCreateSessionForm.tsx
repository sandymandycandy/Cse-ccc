"use client";

import { useActionState } from "react";
import { createSessionAction } from "@/app/admin/(app)/council/actions";
import type { SessionFormState } from "@/lib/admin/form-state";
import { FieldError, fieldClass } from "./FieldError";

const initial: SessionFormState = {};

export function CouncilCreateSessionForm() {
  const [state, action, pending] = useActionState(createSessionAction, initial);
  return (
    <form action={action} style={{ display: "grid", gap: 10, maxWidth: 460 }}>
      <div className={fieldClass(state.fieldErrors, "title")} style={{ margin: 0 }}>
        <label htmlFor="title">Meeting name</label>
        <input id="title" name="title" required maxLength={140} placeholder="Council sync" />
        <FieldError errors={state.fieldErrors} name="title" />
      </div>
      <div className={fieldClass(state.fieldErrors, "sessionDate")} style={{ margin: 0 }}>
        <label htmlFor="sessionDate">Date</label>
        <input id="sessionDate" name="sessionDate" type="date" required />
        <FieldError errors={state.fieldErrors} name="sessionDate" />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div className={fieldClass(state.fieldErrors, "startTime")} style={{ margin: 0, flex: 1 }}>
          <label htmlFor="startTime">Start</label>
          <input id="startTime" name="startTime" type="time" required />
          <FieldError errors={state.fieldErrors} name="startTime" />
        </div>
        <div className={fieldClass(state.fieldErrors, "endTime")} style={{ margin: 0, flex: 1 }}>
          <label htmlFor="endTime">End</label>
          <input id="endTime" name="endTime" type="time" required />
          <FieldError errors={state.fieldErrors} name="endTime" />
        </div>
      </div>
      <button className="btn btn-primary" disabled={pending} style={{ justifySelf: "start" }}>
        {pending ? "Creating…" : "Create meeting & take attendance"}
      </button>
      {state.error ? <div className="note" style={{ borderLeftColor: "var(--rust)" }}>{state.error}</div> : null}
    </form>
  );
}
