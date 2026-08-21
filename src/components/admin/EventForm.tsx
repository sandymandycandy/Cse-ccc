"use client";

import { useActionState } from "react";
import { createEventAction } from "@/app/admin/(app)/events/actions";
import type { EventFormState } from "@/lib/admin/form-state";

interface Option {
  id: string;
  name: string;
}

const initial: EventFormState = {};

export function EventForm({
  clubs,
  venues,
  fixedClub,
}: {
  clubs: Option[];
  venues: Option[];
  fixedClub: Option | null;
}) {
  const [state, action, pending] = useActionState(createEventAction, initial);

  return (
    <form action={action} style={{ marginTop: 20 }}>
      {state.error ? (
        <div className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>
          {state.error}
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="title">Title</label>
        <input id="title" name="title" required maxLength={140} />
      </div>

      <div className="field">
        <label htmlFor="description">Description</label>
        <textarea id="description" name="description" rows={4} maxLength={4000} />
      </div>

      {fixedClub ? (
        <>
          <input type="hidden" name="clubId" value={fixedClub.id} />
          <div className="field">
            <label>Hosting club</label>
            <input value={fixedClub.name} disabled />
          </div>
        </>
      ) : (
        <div className="field">
          <label htmlFor="clubId">Hosting club</label>
          <select id="clubId" name="clubId" required defaultValue="">
            <option value="" disabled>
              Choose a club…
            </option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label htmlFor="venueId">Venue</label>
        <select id="venueId" name="venueId" defaultValue="">
          <option value="">— No venue —</option>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>

      <div className="admin-form-row">
        <div className="field">
          <label htmlFor="startsAt">Starts (IST)</label>
          <input id="startsAt" name="startsAt" type="datetime-local" required />
        </div>
        <div className="field">
          <label htmlFor="endsAt">Ends (IST)</label>
          <input id="endsAt" name="endsAt" type="datetime-local" required />
        </div>
      </div>

      <div className="field">
        <label htmlFor="capacity">Capacity (optional)</label>
        <input id="capacity" name="capacity" type="number" min={0} />
      </div>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Create event"}
      </button>
    </form>
  );
}
