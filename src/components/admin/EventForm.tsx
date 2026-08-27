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
  venueText: string;
  startsAtLocal: string;
  endsAtLocal: string;
  capacity: string;
  posterUrl: string | null;
}

type EventAction = (
  prev: EventFormState,
  formData: FormData,
) => Promise<EventFormState>;

const emptyState: EventFormState = {};

export function EventForm({
  action,
  clubs,
  fixedClub,
  submitLabel = "Create event",
  savingLabel = "Saving…",
  eventId,
  initial,
}: {
  action: EventAction;
  clubs: Option[];
  fixedClub: Option | null;
  submitLabel?: string;
  savingLabel?: string;
  eventId?: string;
  initial?: EventFormInitial;
}) {
  const [state, formAction, pending] = useActionState(action, emptyState);

  return (
    <form action={formAction} encType="multipart/form-data" style={{ marginTop: 20 }}>
      {eventId ? <input type="hidden" name="eventId" value={eventId} /> : null}

      {state.error ? (
        <div className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>
          {state.error}
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="title">Title</label>
        <input id="title" name="title" required maxLength={140} defaultValue={initial?.title} placeholder="e.g. Intro to Machine Learning" />
      </div>

      <div className="field">
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          name="description"
          rows={4}
          maxLength={4000}
          defaultValue={initial?.description}
          placeholder="What's this event about? Who should come?"
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
        <label htmlFor="venueText">Venue</label>
        <input
          id="venueText"
          name="venueText"
          maxLength={120}
          defaultValue={initial?.venueText}
          placeholder="e.g. Main Auditorium, Block C"
        />
        <span className="hint">Type the room or place. Leave blank if it&rsquo;s not decided yet.</span>
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
        <input id="capacity" name="capacity" type="number" min={0} defaultValue={initial?.capacity} placeholder="Leave blank for unlimited" />
      </div>

      <div className="field">
        <label htmlFor="image">Cover photo (optional)</label>
        {initial?.posterUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={initial.posterUrl}
              alt="Current cover"
              style={{ width: 220, height: 130, objectFit: "cover", borderRadius: 6, marginBottom: 8 }}
            />
            <span className="hint">Upload a new file to replace it.</span>
          </>
        ) : null}
        <input id="image" name="image" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
        <span className="hint">PNG, JPEG, WebP or GIF, up to 5 MB. Shown on the event page.</span>
      </div>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? savingLabel : submitLabel}
      </button>
    </form>
  );
}
