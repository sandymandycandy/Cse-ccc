/**
 * The council-wide club switcher.
 *
 * Both attendance screens are reached with `?club=`, so both need this control —
 * switching club on the dashboard alone would strand a council reader on the
 * wrong club's numbers after they followed a link. It was the same twelve lines
 * of inline-styled markup on each page; this is that markup, once.
 *
 * A plain GET form, so the club lands in the URL and the page stays shareable
 * and back-button-able. `hidden` carries the other query params through — the
 * analytics page has a watchlist threshold that must survive a club change.
 */
export function ClubPicker({
  clubs,
  clubId,
  show,
  hidden,
}: {
  clubs: readonly { id: string; name: string }[];
  clubId: string;
  /** False for club-scoped heads, who have exactly one club and no choice. */
  show: boolean;
  hidden?: Record<string, string>;
}) {
  if (!show || clubs.length === 0) return null;

  return (
    <form method="get" className="att-clubpick">
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <label className="label" htmlFor="club-picker">
        Club
      </label>
      <select id="club-picker" name="club" defaultValue={clubId} className="select-input">
        {clubs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button className="btn btn-sm">View</button>
    </form>
  );
}
