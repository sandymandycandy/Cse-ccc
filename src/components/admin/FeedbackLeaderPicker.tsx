import type { ClubLeaderChoice } from "@/lib/admin/feedback";
import { setClubLeadersAction } from "@/app/admin/(app)/feedback/actions";

/** Which head / vice head the public form names, per club. Only clubs where the
 *  choice is ambiguous (more than one candidate) actually need an answer; the
 *  rest are shown read-only so it's clear who is being named. */
export function FeedbackLeaderPicker({ clubs }: { clubs: ClubLeaderChoice[] }) {
  return (
    <div className="tablewrap" style={{ marginTop: 18 }}>
      <table className="admin">
        <thead>
          <tr>
            <th>Club</th>
            <th>Club head</th>
            <th>Vice head</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {clubs.map((c) => {
            const needsChoice = c.heads.length > 1 || c.viceHeads.length > 1;
            return (
              <tr key={c.clubId}>
                <td style={{ fontWeight: needsChoice ? 600 : 400 }}>
                  {c.clubName}
                  {needsChoice ? (
                    <div className="label" style={{ color: "var(--rust)" }}>
                      needs a choice
                    </div>
                  ) : null}
                </td>
                <td colSpan={3}>
                  <form action={setClubLeadersAction} className="stack" style={{ gap: 8 }}>
                    <input type="hidden" name="clubId" value={c.clubId} />
                    <select name="headId" defaultValue={c.curatedHeadId ?? ""}>
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
                    <select name="viceHeadId" defaultValue={c.curatedViceHeadId ?? ""}>
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
                    <button type="submit" className="btn btn-ghost btn-sm">
                      Save
                    </button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
