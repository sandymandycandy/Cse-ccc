import type { ReactNode } from "react";

/** No-op so a card can be rendered read-only (in a test, say) without React
 *  warning about a `checked` input with no handler. */
const noop = () => {};

/**
 * One choice of recipients, as a card rather than a bare radio.
 *
 * Two things this shape buys over the radio-plus-text it replaces: the whole
 * head row is the tap target instead of a ~16px circle, and a choice's extra
 * fields (which club, which registrants) sit INSIDE the card that revealed
 * them, so the relationship survives a phone — the old 26px indent did not.
 *
 * ⚠️ The nested fields are deliberately outside the `<label>`. A `<select>`
 * within it would re-toggle the radio when opened, and would leave the label
 * with two controls to be "for".
 *
 * The selected state is an attribute rather than `:has(input:checked)` so the
 * highlight follows React's state exactly, and can be asserted in a test.
 */
export function AudienceOption({
  name,
  value,
  checked,
  onChange,
  title,
  detail,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange?: () => void;
  title: ReactNode;
  /** The count, on its own line — "24 — 3 have no address on file" trailing the
   *  title is one long unscannable run at phone width. */
  detail?: ReactNode;
  /** Fields that only matter once this option is chosen. */
  children?: ReactNode;
}) {
  return (
    <div className="audience-opt" data-checked={checked ? "true" : undefined}>
      <label className="audience-head">
        <input
          type="radio"
          name={name}
          value={value}
          checked={checked}
          onChange={onChange ?? noop}
        />
        <span className="audience-body">
          <span className="audience-title">{title}</span>
          {detail ? <span className="hint audience-detail">{detail}</span> : null}
        </span>
      </label>
      {checked && children ? <div className="audience-extra">{children}</div> : null}
    </div>
  );
}
