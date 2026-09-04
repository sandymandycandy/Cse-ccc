import type { ClubLeaderChoice } from "@/lib/admin/feedback";
import { setClubLeadersAction } from "@/app/admin/(app)/feedback/actions";

/**
 * Which head / vice head the public form names, per club.
 *
 * A grid of small edit cards rather than a table: these are per-club forms, not
 * comparable rows, and a <form> cannot legally span table cells — the table
 * version needed a colSpan that left the header labels misaligned. Cards also
 * collapse to one column on a phone with no special casing.
 *
 * Only clubs with more than one candidate for a role actually need a decision;
 * the rest are shown anyway so it is clear who the form is naming.
 */
export function FeedbackLeaderPicker({ clubs }: { clubs: ClubLeaderChoice[] }) {
  return (
    <div className="fb-picker">
      {clubs.map((c) => {
        const needsChoice = c.heads.length > 1 || c.viceHeads.length > 1;
        return (
          <form key={c.clubId} action={setClubLeadersAction} className="fb-picker-card">
            <input type="hidden" name="clubId" value={c.clubId} />
            <h3>{c.clubName}</h3>
            {needsChoice ? (
              <div className="label" style={{ color: "var(--rust)" }}>
                needs a choice
              </div>
            ) : null}

            <div className="field">
              <label htmlFor={`head-${c.clubId}`}>Club head</label>
              <select
                id={`head-${c.clubId}`}
                name="headId"
                defaultValue={c.curatedHeadId ?? ""}
              >
                <option value="">
                  {c.heads.length === 1
                    ? `${c.heads[0].name} (only candidate)`
                    : "Not shown"}
                </option>
                {c.heads.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor={`vice-${c.clubId}`}>Vice head</label>
              <select
                id={`vice-${c.clubId}`}
                name="viceHeadId"
                defaultValue={c.curatedViceHeadId ?? ""}
              >
                <option value="">
                  {c.viceHeads.length === 1
                    ? `${c.viceHeads[0].name} (only candidate)`
                    : "Not shown"}
                </option>
                {c.viceHeads.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            <button type="submit" className="btn btn-ghost btn-sm">
              Save
            </button>
          </form>
        );
      })}
    </div>
  );
}
