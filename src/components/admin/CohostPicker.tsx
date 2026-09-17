"use client";

import { useEffect, useRef, useState } from "react";
import { FieldError, fieldClass } from "@/components/admin/FieldError";
import { cohostSummary } from "@/lib/admin/cohost-summary";
import { matchesAny } from "@/lib/admin/roster-filter";

interface Option {
  id: string;
  name: string;
}

/**
 * Co-hosting clubs for an event (spec 2026-09-15 §2), as a collapsed
 * multi-select. It was fifteen bare checkboxes — about 1,100px of optional
 * field sitting between the hosting club and the venue, which pushed the rest
 * of the form off a laptop screen.
 *
 * ⚠️ **Every checkbox stays mounted, checked or not, open or closed.** The panel
 * is hidden with `hidden`, and a hidden input still posts — so the server keeps
 * reading `formData.getAll("cohostIds")` exactly as before (`events/actions.ts`).
 * Do not swap this for a controlled `<select multiple>` or unmount the unchecked
 * boxes: either would change what the action receives.
 *
 * The hosting club is left out rather than shown disabled, because a club is
 * never its own co-host. The server drops it anyway (`normalizeCohosts`), so
 * this is only about not offering a choice that means nothing. A co-host may
 * untick its own club: that takes the club off the event.
 */
export function CohostPicker({
  clubs,
  primaryClubId,
  selected,
  fieldErrors,
}: {
  clubs: Option[];
  primaryClubId: string;
  selected: readonly string[];
  fieldErrors?: Record<string, string>;
}) {
  const choices = clubs.filter((c) => c.id !== primaryClubId);
  const [picked, setPicked] = useState<string[]>([...selected]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const root = useRef<HTMLDivElement>(null);

  // Close on a click outside or Escape — the same pattern as the certificate
  // designer's FieldMenu, so both dropdowns in the admin behave alike.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  // Derived from `choices`, which already drops the primary — so a club promoted
  // to host loses its chip AND its checkbox without any state to keep in step.
  // Its id stays in `picked` harmlessly: nothing renders it, nothing posts it,
  // and switching the primary back restores the tick the person made.
  // Chips follow the club order, not the click order, so the list is stable.
  const pickedClubs = choices.filter((c) => picked.includes(c.id));
  const visible = choices.filter((c) => matchesAny([c.name], q));

  return (
    <div className={fieldClass(fieldErrors, "cohostIds")} role="group" aria-labelledby="cohosts-label">
      <span id="cohosts-label" style={{ font: "500 12px var(--sans)", color: "var(--ink-2)" }}>
        Co-hosting clubs (optional)
      </span>

      <div className="cohost" ref={root}>
        <button
          type="button"
          className="cohost-trigger"
          aria-expanded={open}
          aria-controls="cohost-panel"
          onClick={() => setOpen((o) => !o)}
        >
          <span className={pickedClubs.length === 0 ? "cohost-empty" : undefined}>
            {cohostSummary(pickedClubs.map((c) => c.name))}
          </span>
          <span aria-hidden="true" className="cohost-chevron">{open ? "▴" : "▾"}</span>
        </button>

        {/* `hidden`, never unmounted: the checkboxes must stay in the form. */}
        <div className="cohost-panel" id="cohost-panel" hidden={!open}>
          <input
            className="cohost-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter clubs…"
            aria-label="Filter the club list"
          />
          <div className="cohost-list">
            {visible.length === 0 ? (
              <p className="body-text cohost-none">No club matches “{q}”.</p>
            ) : null}
            {choices.map((c) => (
              <label key={c.id} className="cohost-option" hidden={!visible.includes(c)}>
                <input
                  type="checkbox"
                  name="cohostIds"
                  value={c.id}
                  checked={picked.includes(c.id)}
                  onChange={() => toggle(c.id)}
                />
                {c.name}
              </label>
            ))}
          </div>
        </div>
      </div>

      {pickedClubs.length > 0 ? (
        <div className="cohost-chips">
          {pickedClubs.map((c) => (
            <button
              key={c.id}
              type="button"
              className="cohost-chip"
              onClick={() => toggle(c.id)}
              aria-label={`Remove ${c.name} as a co-host`}
            >
              {c.name}<span aria-hidden="true"> ×</span>
            </button>
          ))}
        </div>
      ) : null}

      <span className="hint">
        Co-hosts can edit the event, take attendance, manage registrations and enter results. Only
        the hosting club or the council can cancel it.
      </span>
      <FieldError errors={fieldErrors} name="cohostIds" />
    </div>
  );
}
