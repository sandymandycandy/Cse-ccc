"use client";

import { useActionState, useRef, useState } from "react";
import { ArrowUpRight, CalendarDays, Check, ClipboardList, Clock3, Image as ImageIcon, MapPin, Save, Settings2, Users } from "lucide-react";
import { defaultFormFor } from "@/lib/registration-form/schema";
import { RegistrationFormBuilder } from "./RegistrationFormBuilder";
import { ImageEditor } from "./ImageEditor";
import type { EventFormState } from "@/lib/admin/form-state";
import { FieldError, fieldClass, fieldProps } from "@/components/admin/FieldError";
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

const SECTION_INFO = {
  basics: { title: "Give your event a clear identity", description: "Introduce the event and choose the clubs bringing it to life.", icon: ClipboardList },
  when: { title: "Set the time and place", description: "Keep the schedule clear. All dates and times are in Indian Standard Time (IST).", icon: CalendarDays },
  registration: { title: "Choose how students join", description: "Set your registration window, capacity and what happens after someone signs up.", icon: Settings2 },
  form: { title: "Build the registration form", description: "Choose the information you need from each participant. Your changes are saved with the event.", icon: ClipboardList },
  cover: { title: "Add a cover for your event", description: "A poster helps students recognise your event. This step is optional.", icon: ImageIcon },
};

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
  const tabRefs = useRef<Partial<Record<EventFormTab, HTMLButtonElement | null>>>({});

  const gaps = tabGaps({ ...vals, fieldCount });
  const idx = EVENT_FORM_TABS.findIndex((t) => t.key === tab);
  const set = (patch: Partial<typeof vals>) => setVals((v) => ({ ...v, ...patch }));
  const section = SECTION_INFO[tab];
  const SectionIcon = section.icon;

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
        <div className="ef-save-status"><span className="ef-savenote" data-dirty={dirty} aria-live="polite">
          {dirty ? "Unsaved changes" : eventId ? "Editing event" : "New event"}
        </span><span className="ef-save-help">Save applies to all five sections</span></div>
        {eventId ? (
          <a
            className="btn btn-sm"
            href={`/events/${eventId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View event <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={pending}>
          <Save size={16} aria-hidden="true" />
          {pending ? savingLabel : submitLabel}
        </button>
      </div>

      <div className="ef-editor-layout"><div className="ef-editor-content">
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
              tabIndex={active ? 0 : -1}
              ref={(node) => { tabRefs.current[t.key] = node; }}
              className="ef-tab"
              data-active={active}
              onClick={() => setTab(t.key)}
              onKeyDown={(event) => {
                let next = idx;
                if (event.key === "ArrowRight") next = (idx + 1) % EVENT_FORM_TABS.length;
                else if (event.key === "ArrowLeft") next = (idx + EVENT_FORM_TABS.length - 1) % EVENT_FORM_TABS.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = EVENT_FORM_TABS.length - 1;
                else return;
                event.preventDefault();
                const key = EVENT_FORM_TABS[next].key;
                setTab(key);
                tabRefs.current[key]?.focus();
              }}
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

      <div className="ef-section-heading"><span><SectionIcon size={21} aria-hidden="true" /></span><div><h2>{section.title}</h2><p>{section.description}</p></div></div>

      {state.error ? (
        <div className="note" role="alert" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>
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
            {...fieldProps(state.fieldErrors, "title")}
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
            {...fieldProps(state.fieldErrors, "description")}
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
              {...fieldProps(state.fieldErrors, "clubId")}
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
            {...fieldProps(state.fieldErrors, "venueText")}
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
              {...fieldProps(state.fieldErrors, "startsAt")}
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
              {...fieldProps(state.fieldErrors, "endsAt")}
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
                  {...fieldProps(state.fieldErrors, "selectionMode")}
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
            {...fieldProps(state.fieldErrors, "capacity")}
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
              {...fieldProps(state.fieldErrors, "registrationOpensAt")}
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
              {...fieldProps(state.fieldErrors, "registrationClosesAt")}
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
              {...fieldProps(state.fieldErrors, "waitlistEnabled")}
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
              {...fieldProps(state.fieldErrors, "showOnAchievements")}
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
            {...fieldProps(state.fieldErrors, "whatsappUrl")}
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
          onEdit={() => setDirty(true)}
        />
        <FieldError errors={state.fieldErrors} name="registrationForm" />
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
        <span className="ef-step-count">Section {idx + 1} of {EVENT_FORM_TABS.length}</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={idx === EVENT_FORM_TABS.length - 1}
          onClick={() => setTab(EVENT_FORM_TABS[idx + 1].key)}
        >
          {idx < EVENT_FORM_TABS.length - 1 ? EVENT_FORM_TABS[idx + 1].label : "Done"} →
        </button>
      </div>
      </div>
      <aside className="ef-summary" aria-label="Event summary">
        <span className="dashboard-kicker">As you edit</span><h2>Event overview</h2>
        <h3>{vals.title.trim() || "Your event title"}</h3>
        <dl>
          <div><dt><Users size={15} aria-hidden="true" /> Hosting club</dt><dd>{fixedClub?.name ?? clubs.find((club) => club.id === primaryId)?.name ?? "Choose a club"}</dd></div>
          <div><dt><CalendarDays size={15} aria-hidden="true" /> Date</dt><dd>{dayText(vals.startsAtLocal) || "Set a start date"}</dd></div>
          <div><dt><Clock3 size={15} aria-hidden="true" /> Duration</dt><dd>{durationText(vals.startsAtLocal, vals.endsAtLocal)}</dd></div>
          <div><dt><MapPin size={15} aria-hidden="true" /> Venue</dt><dd>{vals.venue.trim() || "To be confirmed"}</dd></div>
        </dl>
        <div className="ef-summary-note"><Check size={15} aria-hidden="true" /><p>Move between sections freely. Save when you’re ready to apply your changes.</p></div>
      </aside>
      </div>
    </form>
  );
}
