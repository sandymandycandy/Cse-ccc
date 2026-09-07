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
 * A tie renders as several names under one place label, which is what a printed
 * result sheet does — never as a truncated top three.
 *
 * ⚠️ This is NOT shared with `/events/[id]/results`. That page keeps its own
 * champion/runners rendering, which also carries score and team name — neither
 * of which a hand-entered achievement has (spec D6). Both ultimately render
 * from `podiumOf`, so the standings they show cannot disagree; only their
 * presentation can. If you change what a placing *means* here, change it there
 * too.
 */
export function Podium({ winners }: { winners: Winner[] }) {
  const groups = groupByRank(winners);
  if (groups.length === 0) return null;

  return (
    <ol className="podium">
      {groups.map(({ rank, winners: people }) => (
        <li className="podium-place" data-place={rank} key={rank}>
          <div className="podium-label">
            {people.length > 1 ? JOINT[rank] : PLACE[rank]}
          </div>
          <div className="podium-people">
            {people.map((p, i) => (
              <div className="podium-person" key={`${p.roll ?? p.name}-${i}`}>
                <span>{p.name}</span>
                {p.roll ? <span className="roll">{p.roll}</span> : null}
              </div>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}
