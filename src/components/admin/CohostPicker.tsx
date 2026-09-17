import { FieldError, fieldClass } from "@/components/admin/FieldError";

interface Option {
  id: string;
  name: string;
}

/**
 * Co-hosting clubs for an event, one checkbox each (spec 2026-09-15 §2).
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

  return (
    <div className={fieldClass(fieldErrors, "cohostIds")} role="group" aria-labelledby="cohosts-label">
      <span id="cohosts-label" style={{ font: "500 12px var(--sans)", color: "var(--ink-2)" }}>
        Co-hosting clubs (optional)
      </span>
      {choices.map((c) => (
        <label key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}>
          <input
            type="checkbox"
            name="cohostIds"
            value={c.id}
            defaultChecked={selected.includes(c.id)}
          />
          {c.name}
        </label>
      ))}
      <span className="hint">
        Co-hosts can edit the event, take attendance, manage registrations and enter results. Only
        the hosting club or the council can cancel it.
      </span>
      <FieldError errors={fieldErrors} name="cohostIds" />
    </div>
  );
}
