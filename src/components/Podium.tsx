import type { Winner } from "@/lib/achievements-board";
import { groupByRank } from "@/lib/achievements-board";

const PLACE: Record<1 | 2 | 3, string> = {
  1: "Champion",
  2: "Second",
  3: "Third",
};

const JOINT: Record<1 | 2 | 3, string> = {
  1: "Joint champion",
  2: "Joint second",
  3: "Joint third",
};

/**
 * The 1/2/3 podium for the achievements board.
 *
 * A place is "joint" when two separate STANDINGS tie for it — never when one
 * team fields several people. Counting people instead made PITCH DESK's single
 * winning team render as "Joint champion", which is false. Each standing is one
 * visual block, so a team of four reads as one winner and two tied entrants
 * read as two.
 *
 * ⚠️ NOT shared with `/events/[id]/results`. That page keeps its own rendering,
 * which also carries score and team name — neither of which a hand-entered
 * achievement has (spec D6). Both render from `podiumOf`, so the standings
 * cannot disagree; only presentation can.
 */
export function Podium({ winners }: { winners: Winner[] }) {
  const groups = groupByRank(winners);
  if (groups.length === 0) return null;

  return (
    <ol className="podium">
      {groups.map(({ rank, winners: standings }) => (
        <li className="podium-place" data-place={rank} key={rank}>
          <div className="podium-label">
            {standings.length > 1 ? JOINT[rank] : PLACE[rank]}
          </div>
          <div className="podium-standings">
            {standings.map((s, si) => (
              <div className="podium-standing" key={si}>
                {s.people.map((p, i) => (
                  <div className="podium-person" key={`${p.roll ?? p.name}-${i}`}>
                    <span>{p.name}</span>
                    {p.roll ? <span className="roll">{p.roll}</span> : null}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}
