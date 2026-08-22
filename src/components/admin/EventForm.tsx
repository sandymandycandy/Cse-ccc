"use client";

import { useActionState } from "react";
import type { EventFormState } from "@/lib/admin/form-state";

interface Option {
  id: string;
  name: string;
}

/** Prefill values for edit mode. Times are IST wall-clock ("YYYY-MM-DDTHH:mm"). */
export interface EventFormInitial {
  title: string;
  description: string;
  clubId: string;
  venueId: string;
  startsAtLocal: string;
  endsAtLocal: string;
  capacity: string;
}

type EventAction = (
  prev: EventFormState,
  formData: FormData,
) => Promise<EventFormState>;

const emptyState: EventFormState = {};

export function EventForm({
  action,
  clubs,
  venues,
  fixedClub,
  submitLabel = "Create event",
  savingLabel = "Saving…",
  eventId,
  initial,
}: {
  action: EventAction;
  clubs: Option[];
  venues: Option[];
  fixedClub: Option | null;
  submitLabel?: string;
  savingLabel?: string;
  eventId?: string;
  initial?: EventFormInitial;
}) {
  const [state, formAction, pending] = useActionState(action, emptyState);

  return (
    <form action={formAction} style={{ marginTop: 20 }}>
      {eventId ? <input type="hidden" name="eventId" value={eventId} /> : null}

      {state.error ? (
        <div className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>
          {state.error}
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="title">Title</label>
        <input id="title" name="title" required maxLength={140} defaultValue={initial?.title} />
      </div>

      <div className="field">
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          name="description"
          rows={4}
          maxLength={4000}
          defaultValue={initial?.description}
        />
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
          <select id="clubId" name="clubId" required defaultValue={initial?.clubId ?? ""}>
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
        <select id="venueId" name="venueId" defaultValue={initial?.venueId ?? ""}>
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
          <input
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={initial?.startsAtLocal}
          />
        </div>
        <div className="field">
          <label htmlFor="endsAt">Ends (IST)</label>
          <input
            id="endsAt"
            name="endsAt"
            type="datetime-local"
            required
            defaultValue={initial?.endsAtLocal}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="capacity">Capacity (optional)</label>
        <input id="capacity" name="capacity" type="number" min={0} defaultValue={initial?.capacity} />
      </div>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? savingLabel : submitLabel}
      </button>
    </form>
  );
}
