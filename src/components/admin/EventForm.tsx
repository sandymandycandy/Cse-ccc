"use client";

import { useActionState, useState } from "react";
import { defaultFormFor } from "@/lib/registration-form/schema";
import { RegistrationFormBuilder } from "./RegistrationFormBuilder";
import { ImageEditor } from "./ImageEditor";
import type { EventFormState } from "@/lib/admin/form-state";
import { FieldError, fieldClass } from "@/components/admin/FieldError";
import { CohostPicker } from "@/components/admin/CohostPicker";
import {
  EVENT_FORM_TABS,
  capacityHint,
  dayText,
  durationText,
  tabGaps,
  tabWithFirstError,
  type EventFormTab,
} from "@/lib/admin/event-form-progress";

interface Option {
  id: string;
  name: string;
}

/** Prefill values for edit mode. Times are IST wall-clock ("YYYY-MM-DDTHH:mm"). */
export interface EventFormInitial {
  title: string;
  description: string;
  clubId: string;
  /** Co-hosting clubs, not including the primary. */
  cohostIds: string[];
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
  showOnAchievements: boolean;
  /** The event's group chat, given to registrants only. "" when unset. */
  whatsappUrl: string;
}

type EventAction = (
  prev: EventFormState,
  formData: FormData,
) => Promise<EventFormState>;

const emptyState: EventFormState = {};

/** How many questions a stored form schema holds, for the Form tab's count. */
function countFields(json: string | undefined): number {
  if (!json) return defaultFormFor().length;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed.length : defaultFormFor().length;
  } catch {
    return defaultFormFor().length;
  }
}

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
  const [tab, setTab] = useState<EventFormTab>("basics");
  // Tracked only so the co-host list can leave out whichever club is hosting.
  const [primaryId, setPrimaryId] = useState(fixedClub?.id ?? initial?.clubId ?? "");
  // Mirrors of the fields the tab dots read. The inputs stay uncontrolled —
  // this only shadows them, so a re-render can never fight the caret.
  const [vals, setVals] = useState({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    venue: initial?.venueText ?? "",
    startsAtLocal: initial?.startsAtLocal ?? "",
    endsAtLocal: initial?.endsAtLocal ?? "",
    registrationClosesAtLocal: initial?.registrationClosesAtLocal ?? "",
  });
  const [mode, setMode] = useState<"seats" | "shortlist">(initial?.selectionMode ?? "seats");
  const [fieldCount, setFieldCount] = useState(() => countFields(initial?.registrationForm));
  const [dirty, setDirty] = useState(false);

  const gaps = tabGaps({ ...vals, fieldCount });
  const idx = EVENT_FORM_TABS.findIndex((t) => t.key === tab);
  const set = (patch: Partial<typeof vals>) => setVals((v) => ({ ...v, ...patch }));

  /* A rejected save names a field, and with five tabs that field is usually not
     the one on screen. Without this the complaint renders on a hidden panel and
     the save reads as having done nothing at all.

     Adjusted during render rather than in an effect — React's own pattern for
     reacting to a changed input, and it repaints once instead of twice. The
     guard is the state object's identity, not the field names: every action
     result is a fresh object, so submitting the same broken form twice re-opens
     the tab both times. */
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    const target = tabWithFirstError(state.fieldErrors);
    if (target) setTab(target);
  }

  return (
    /* noValidate on purpose: four of the five panels are `hidden` at any moment,
       and the browser refuses to report a constraint on a control it cannot
       focus — it silently blocks submit instead. The server action validates
       every field and returns per-field messages, and `tabWithFirstError` opens
       the tab holding the first of them. `required` stays on the inputs for
       what it tells assistive tech. */
    <form
      action={formAction}
      noValidate
      className="ef"
      onChange={() => setDirty(true)}
    >
      {eventId ? <input type="hidden" name="eventId" value={eventId} /> : null}

      {/* Sticky: the save button used to live at the bottom of a ~2,000px page.
          It carries the unsaved-changes note so leaving a half-filled tab is a
          decision rather than an accident. */}
      <div className="ef-bar">
        <span className="ef-savenote" aria-live="polite">
          {dirty ? "Unsaved changes" : ""}
        </span>
        {eventId ? (
          <a
            className="btn btn-sm"
            href={`/events/${eventId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View event
          </a>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? savingLabel : submitLabel}
        </button>
      </div>

      {/* Each tab carries a dot: amber while that panel still wants something,
          green once it doesn't. It is the only thing reporting the four panels
          you cannot see. */}
      <div className="ef-tabs" role="tablist" aria-label="Event form sections">
        {EVENT_FORM_TABS.map((t) => {
          const gap = gaps[t.key];
          const active = t.key === tab;
          return (
            <button
              type="button"
              role="tab"
              key={t.key}
              id={`ef-tab-${t.key}`}
              aria-selected={active}
              aria-controls={`ef-panel-${t.key}`}
              className="ef-tab"
              data-active={active}
              onClick={() => setTab(t.key)}
            >
              <span className="ef-tab-n">{t.n}</span>
              <span>{t.label}</span>
              {t.key === "form" ? <span className="ef-tab-meta">{fieldCount}</span> : null}
              <span
                className="ef-tab-dot"
                data-gap={gap ? "true" : "false"}
                title={gap ? `Still needs ${gap}` : "Nothing outstanding"}
              />
            </button>
          );
        })}
      </div>

      {state.error ? (
        <div className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>
          {state.error}
        </div>
      ) : null}

      {/* Every panel stays mounted — `hidden`, not unmounted — so a value typed
          on one tab is still in the FormData when you save from another. */}
      <div
        className="ef-panel"
        id="ef-panel-basics"
        role="tabpanel"
        aria-labelledby="ef-tab-basics"
        hidden={tab !== "basics"}
      >
        <div className={fieldClass(state.fieldErrors, "title")}>
          <label htmlFor="title">Title</label>
          <input
            id="title"
            name="title"
            required
            maxLength={140}
            defaultValue={initial?.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="e.g. Intro to Machine Learning"
          />
          <FieldError errors={state.fieldErrors} name="title" />
        </div>

        <div className={fieldClass(state.fieldErrors, "description")}>
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            rows={4}
            maxLength={4000}
            defaultValue={initial?.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="What's this event about? Who should come?"
          />
          <FieldError errors={state.fieldErrors} name="description" />
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
          <div className={fieldClass(state.fieldErrors, "clubId")}>
            <label htmlFor="clubId">Hosting club</label>
            <select
              id="clubId"
              name="clubId"
              required
              defaultValue={initial?.clubId ?? ""}
              onChange={(e) => setPrimaryId(e.target.value)}
            >
              <option value="" disabled>
                Choose a club…
              </option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <FieldError errors={state.fieldErrors} name="clubId" />
          </div>
        )}

        <CohostPicker
          clubs={clubs}
          primaryClubId={primaryId}
          selected={initial?.cohostIds ?? []}
          fieldErrors={state.fieldErrors}
        />
      </div>

      <div
        className="ef-panel"
        id="ef-panel-when"
        role="tabpanel"
        aria-labelledby="ef-tab-when"
        hidden={tab !== "when"}
      >
        <div className={fieldClass(state.fieldErrors, "venueText")}>
          <label htmlFor="venueText">Venue</label>
          <input
            id="venueText"
            name="venueText"
            maxLength={120}
            defaultValue={initial?.venueText}
            onChange={(e) => set({ venue: e.target.value })}
            placeholder="e.g. Main Auditorium, Block C"
          />
          <span className="hint">Type the room or place. Leave blank if it&rsquo;s not decided yet.</span>
          <FieldError errors={state.fieldErrors} name="venueText" />
        </div>

        <div className="admin-form-row">
          <div className={fieldClass(state.fieldErrors, "startsAt")}>
            <label htmlFor="startsAt">Starts (IST)</label>
            <input
              id="startsAt"
              name="startsAt"
              type="datetime-local"
              required
              defaultValue={initial?.startsAtLocal}
              onChange={(e) => set({ startsAtLocal: e.target.value })}
            />
            <FieldError errors={state.fieldErrors} name="startsAt" />
          </div>
          <div className={fieldClass(state.fieldErrors, "endsAt")}>
            <label htmlFor="endsAt">Ends (IST)</label>
            <input
              id="endsAt"
              name="endsAt"
              type="datetime-local"
              required
              defaultValue={initial?.endsAtLocal}
              onChange={(e) => set({ endsAtLocal: e.target.value })}
            />
            <FieldError errors={state.fieldErrors} name="endsAt" />
          </div>
        </div>

        {/* The quickest way to catch a PM/AM slip: a three-hour workshop that
            reads "11 hours" is wrong in a way a validation message never says. */}
        <div className="ef-runs">
          <span className="label">Runs for</span>
          <span className="ef-runs-n">{durationText(vals.startsAtLocal, vals.endsAtLocal)}</span>
          <span className="ef-runs-day">{dayText(vals.startsAtLocal)}</span>
        </div>
      </div>

      <div
        className="ef-panel"
        id="ef-panel-registration"
        role="tabpanel"
        aria-labelledby="ef-tab-registration"
        hidden={tab !== "registration"}
      >
        <div className={fieldClass(state.fieldErrors, "selectionMode")}>
          <span className="ef-legend">Registration type</span>
          <div className="ef-modes">
            {(
              [
                { key: "seats", title: "Seats", body: "First come, capacity-limited." },
                { key: "shortlist", title: "Shortlist", body: "Collect everyone, you pick later." },
              ] as const
            ).map((m) => (
              <label className="ef-mode" key={m.key} data-on={mode === m.key}>
                <input
                  type="radio"
                  name="selectionMode"
                  value={m.key}
                  checked={mode === m.key}
                  onChange={() => setMode(m.key)}
                />
                <span className="ef-mode-title">{m.title}</span>
                <span className="ef-mode-body">{m.body}</span>
              </label>
            ))}
          </div>
          <FieldError errors={state.fieldErrors} name="selectionMode" />
        </div>

        <div className={fieldClass(state.fieldErrors, "capacity")}>
          <label htmlFor="capacity">Capacity (optional)</label>
          <input
            id="capacity"
            name="capacity"
            type="number"
            min={0}
            defaultValue={initial?.capacity}
            placeholder="Leave blank for unlimited"
          />
          {/* Says outright that capacity does nothing in shortlist mode, rather
              than leaving a filled-in number that is quietly ignored. */}
          <span className="hint">{capacityHint(mode)}</span>
          <FieldError errors={state.fieldErrors} name="capacity" />
        </div>

        <div className="admin-form-row">
          <div className={fieldClass(state.fieldErrors, "registrationOpensAt")}>
            <label htmlFor="registrationOpensAt">Registration opens (IST) — optional</label>
            <input
              id="registrationOpensAt"
              name="registrationOpensAt"
              type="datetime-local"
              defaultValue={initial?.registrationOpensAtLocal}
            />
            <span className="hint">Leave blank to open right away. Until then students see a live countdown.</span>
            <FieldError errors={state.fieldErrors} name="registrationOpensAt" />
          </div>
          <div className={fieldClass(state.fieldErrors, "registrationClosesAt")}>
            <label htmlFor="registrationClosesAt">Registration closes (IST) — optional</label>
            <input
              id="registrationClosesAt"
              name="registrationClosesAt"
              type="datetime-local"
              defaultValue={initial?.registrationClosesAtLocal}
              onChange={(e) => set({ registrationClosesAtLocal: e.target.value })}
            />
            <FieldError errors={state.fieldErrors} name="registrationClosesAt" />
          </div>
        </div>

        <div className={fieldClass(state.fieldErrors, "waitlistEnabled")}>
          <label className="ef-switch">
            <input
              type="checkbox"
              name="waitlistEnabled"
              defaultChecked={initial ? initial.waitlistEnabled : true}
            />
            <span>Allow a waitlist when the seats fill</span>
          </label>
          <span className="hint">
            Extra students join a waitlist you can promote from on the registrations page.
          </span>
          <FieldError errors={state.fieldErrors} name="waitlistEnabled" />
        </div>

        <div className={fieldClass(state.fieldErrors, "showOnAchievements")}>
          <label className="ef-switch">
            <input
              type="checkbox"
              name="showOnAchievements"
              defaultChecked={initial ? initial.showOnAchievements : true}
            />
            <span>Show this event&rsquo;s podium on the achievements board</span>
          </label>
          <span className="hint">
            On by default. Once results are published, the top three appear on the
            public achievements page — untick to keep them off it.
          </span>
          <FieldError errors={state.fieldErrors} name="showOnAchievements" />
        </div>

        <div className={fieldClass(state.fieldErrors, "whatsappUrl")}>
          <label htmlFor="whatsappUrl">WhatsApp group link (optional)</label>
          <input
            id="whatsappUrl"
            name="whatsappUrl"
            type="url"
            inputMode="url"
            maxLength={300}
            defaultValue={initial?.whatsappUrl}
            placeholder="https://chat.whatsapp.com/…"
          />
          <span className="hint">
            Shown in a pop-up the moment someone registers, and again in their confirmation
            email. Never shown on the public event page — only people who actually register
            get it. Must start with https://
          </span>
          <FieldError errors={state.fieldErrors} name="whatsappUrl" />
        </div>
      </div>

      <div
        className="ef-panel"
        id="ef-panel-form"
        role="tabpanel"
        aria-labelledby="ef-tab-form"
        hidden={tab !== "form"}
      >
        <RegistrationFormBuilder
          initialJson={initial?.registrationForm ?? JSON.stringify(defaultFormFor())}
          onCountChange={setFieldCount}
        />
      </div>

      <div
        className="ef-panel"
        id="ef-panel-cover"
        role="tabpanel"
        aria-labelledby="ef-tab-cover"
        hidden={tab !== "cover"}
      >
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
      </div>

      {/* Stepping, not just tabs: filling this in the first time is a sequence,
          and the strip alone never says which panel comes next. */}
      <div className="ef-steps">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={idx === 0}
          onClick={() => setTab(EVENT_FORM_TABS[idx - 1].key)}
        >
          ← {idx > 0 ? EVENT_FORM_TABS[idx - 1].label : "Back"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={idx === EVENT_FORM_TABS.length - 1}
          onClick={() => setTab(EVENT_FORM_TABS[idx + 1].key)}
        >
          {idx < EVENT_FORM_TABS.length - 1 ? EVENT_FORM_TABS[idx + 1].label : "Done"} →
        </button>
      </div>
    </form>
  );
}
