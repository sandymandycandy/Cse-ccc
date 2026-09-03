"use client";

import { useActionState } from "react";
import { defaultFormFor } from "@/lib/registration-form/schema";
import { RegistrationFormBuilder } from "./RegistrationFormBuilder";
import { ImageEditor } from "./ImageEditor";
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
  selectionMode: "seats" | "shortlist";
  registrationForm: string;
  registrationOpensAtLocal: string;
  registrationClosesAtLocal: string;
  waitlistEnabled: boolean;
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
        <label htmlFor="selectionMode">Registration type</label>
        <select id="selectionMode" name="selectionMode" defaultValue={initial?.selectionMode ?? "seats"}>
          <option value="seats">Seats — first come, capacity-limited</option>
          <option value="shortlist">Shortlist — collect everyone, you pick later</option>
        </select>
        <span className="hint">Shortlist ignores capacity; you select applicants afterward.</span>
      </div>

      <div className="field">
        <label htmlFor="capacity">Capacity (optional)</label>
        <input id="capacity" name="capacity" type="number" min={0} defaultValue={initial?.capacity} placeholder="Leave blank for unlimited" />
      </div>

      <div className="admin-form-row">
        <div className="field">
          <label htmlFor="registrationOpensAt">Registration opens (IST) — optional</label>
          <input
            id="registrationOpensAt"
            name="registrationOpensAt"
            type="datetime-local"
            defaultValue={initial?.registrationOpensAtLocal}
          />
          <span className="hint">Leave blank to open right away. Until then students see a live countdown.</span>
        </div>
        <div className="field">
          <label htmlFor="registrationClosesAt">Registration closes (IST) — optional</label>
          <input
            id="registrationClosesAt"
            name="registrationClosesAt"
            type="datetime-local"
            defaultValue={initial?.registrationClosesAtLocal}
          />
        </div>
      </div>

      <div className="field">
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}>
          <input
            type="checkbox"
            name="waitlistEnabled"
            defaultChecked={initial ? initial.waitlistEnabled : true}
          />
          Allow a waitlist when the seats fill
        </label>
        <span className="hint">
          Extra students join a waitlist you can promote from on the registrations page.
        </span>
      </div>

      <RegistrationFormBuilder
        initialJson={initial?.registrationForm ?? JSON.stringify(defaultFormFor())}
      />

      {/* No aspect default: the event page renders the poster at full width with
          no height cap, so a portrait poster is already shown uncut. The editor
          is here for straightening, rotating and shrinking oversized files. */}
      <ImageEditor
        label="Cover photo (optional)"
        initialUrl={initial?.posterUrl ?? null}
        defaultAspect={null}
        longEdge={2400}
        hint="Crop, rotate and resize before uploading. Shown on the event page."
      />

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? savingLabel : submitLabel}
      </button>
    </form>
  );
}
