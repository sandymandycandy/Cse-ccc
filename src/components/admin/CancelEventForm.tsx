"use client";

import { useActionState } from "react";
import { cancelEventAction } from "@/app/admin/(app)/events/actions";
import type { EventFormState } from "@/lib/admin/form-state";

const initial: EventFormState = {};

export function CancelEventForm({ eventId }: { eventId: string }) {
  const [state, action, pending] = useActionState(cancelEventAction, initial);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            "Cancel this event? Confirmed registrants will be emailed. This can't be undone here.",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="eventId" value={eventId} />
      {state.error ? (
        <div className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 12 }}>
          {state.error}
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="reason">Reason (optional — shared with registrants)</label>
        <input id="reason" name="reason" maxLength={500} />
      </div>
      <button
        type="submit"
        className="btn"
        style={{ color: "var(--rust)", borderColor: "var(--rust)" }}
        disabled={pending}
      >
        {pending ? "Cancelling…" : "Cancel event"}
      </button>
    </form>
  );
}
