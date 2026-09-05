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

/**
 * One role: the account dropdown, plus a free-text name beneath it.
 *
 * The text box exists because a club's real vice head may hold no admin account
 * at all, and a role that resolves to nobody is not rendered on the public form
 * — so those clubs silently collect no feedback. The dropdown wins when it
 * names an account; the typed name covers everyone else.
 */
function LeaderField({
  clubId,
  role,
  label,
  selectName,
  nameField,
  candidates,
  curatedId,
  typedName,
}: {
  clubId: string;
  role: string;
  label: string;
  selectName: string;
  nameField: string;
  candidates: { id: string; name: string }[];
  curatedId: string | null;
  typedName: string | null;
}) {
  const selectId = `${role}-${clubId}`;
  const inputId = `${role}-name-${clubId}`;
  return (
    <div className="field">
      <label htmlFor={selectId}>{label}</label>
      <select id={selectId} name={selectName} defaultValue={curatedId ?? ""}>
        <option value="">
          {candidates.length === 1 ? `${candidates[0].name} (only candidate)` : "Not shown"}
        </option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <label htmlFor={inputId} className="hint" style={{ marginTop: 8 }}>
        or type a name — for a {label.toLowerCase()} with no admin account
      </label>
      <input
        id={inputId}
        name={nameField}
        type="text"
        maxLength={80}
        defaultValue={typedName ?? ""}
        placeholder="e.g. Kaviya R"
      />
    </div>
  );
}

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

            <LeaderField
              clubId={c.clubId}
              role="head"
              label="Club head"
              selectName="headId"
              nameField="headName"
              candidates={c.heads}
              curatedId={c.curatedHeadId}
              typedName={c.typedHeadName}
            />

            <LeaderField
              clubId={c.clubId}
              role="vice"
              label="Vice head"
              selectName="viceHeadId"
              nameField="viceHeadName"
              candidates={c.viceHeads}
              curatedId={c.curatedViceHeadId}
              typedName={c.typedViceHeadName}
            />

            <button type="submit" className="btn btn-ghost btn-sm">
              Save
            </button>
          </form>
        );
      })}
    </div>
  );
}
