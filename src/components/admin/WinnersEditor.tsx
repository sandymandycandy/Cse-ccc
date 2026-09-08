"use client";

import { useMemo, useState } from "react";
import type { Winner } from "@/lib/achievements-board";

interface Row {
  rank: 1 | 2 | 3;
  name: string;
  roll: string;
}

const RANK_LABEL: Record<1 | 2 | 3, string> = { 1: "1st", 2: "2nd", 3: "3rd" };

/**
 * Repeatable prize-winner rows, serialised into one hidden field — the same
 * shape RegistrationFormBuilder uses, so the server parses it the same way.
 *
 * Two shapes meet here. `Winner` is a STANDING carrying its people, which is
 * what the board renders; the `achievements.winners` jsonb is FLAT
 * ({rank,name,roll} per row), which is what `parseWinners` reads back. A
 * hand-entered winner is a standing of exactly one person, so this editor is
 * the flat side and only maps in from `Winner` on load.
 *
 * Ranks are NOT unique: two third places is the whole point (a tie renders as
 * "Joint third"), so nothing here deduplicates them.
 */
export function WinnersEditor({ initial }: { initial?: Winner[] }) {
  const [rows, setRows] = useState<Row[]>(() =>
    // flatMap, not people[0]: parseWinners gives a manual winner exactly one
    // person, but flattening can never silently drop a name if that changes.
    (initial ?? []).flatMap((w) =>
      w.people.map((p) => ({ rank: w.rank, name: p.name, roll: p.roll ?? "" })),
    ),
  );

  const json = useMemo(
    () =>
      JSON.stringify(
        rows
          .filter((r) => r.name.trim() !== "")
          .map((r) => ({
            rank: r.rank,
            name: r.name.trim(),
            roll: r.roll.trim() === "" ? null : r.roll.trim(),
          })),
      ),
    [rows],
  );

  function update(i: number, patch: Partial<Row>) {
    setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="field">
      <span className="label">Prize winners</span>
      <span className="hint" style={{ display: "block", margin: "4px 0 10px" }}>
        Optional. Leave empty for an achievement that isn&rsquo;t a placed win.
        Two people can share a place — add both with the same rank.
      </span>

      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <select
            aria-label={`Winner ${i + 1} place`}
            value={r.rank}
            onChange={(e) => update(i, { rank: Number(e.target.value) as 1 | 2 | 3 })}
            style={{ width: 84 }}
          >
            {([1, 2, 3] as const).map((n) => (
              <option key={n} value={n}>{RANK_LABEL[n]}</option>
            ))}
          </select>
          <input
            aria-label={`Winner ${i + 1} name`}
            value={r.name}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder="Full name"
            maxLength={120}
            style={{ flex: "2 1 180px" }}
          />
          <input
            aria-label={`Winner ${i + 1} roll number`}
            value={r.roll}
            onChange={(e) => update(i, { roll: e.target.value })}
            placeholder="vtuxxxxx (optional)"
            maxLength={40}
            style={{ flex: "1 1 130px" }}
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setRows((cur) => cur.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-sm"
        onClick={() => setRows((cur) => [...cur, { rank: 1, name: "", roll: "" }])}
      >
        Add winner
      </button>

      <input type="hidden" name="winners" value={json} readOnly />
    </div>
  );
}
