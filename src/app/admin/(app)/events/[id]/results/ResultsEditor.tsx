"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { rankByScore } from "@/lib/results";
import type { RosterEntry } from "@/lib/admin/results";
import {
  saveResultsAction,
  publishRoundAction,
  unpublishRoundAction,
  proceedToNextRoundAction,
} from "./actions";

const inp: CSSProperties = {
  font: "400 13px var(--sans)",
  padding: "4px 7px",
  border: "1px solid var(--line-4)",
  borderRadius: 6,
  background: "var(--paper)",
  color: "var(--ink)",
  width: "100%",
};

const emptyRow = (): RosterEntry => ({
  roll_no: "",
  display_name: "",
  registration_id: null,
  // A hand-added row has no registration behind it, so no team.
  team_name: null,
  score: null,
  rank: null,
  advanced: false,
  remarks: null,
});

const chkLabel: CSSProperties = {
  display: "inline-flex",
  gap: 4,
  alignItems: "center",
  font: "400 13px var(--sans)",
  color: "var(--ink)",
};

export function ResultsEditor(props: {
  eventId: string;
  roundId: string;
  initialRows: RosterEntry[];
  seededFrom: string;
  published: boolean;
  canEdit: boolean;
  visibility: { show_score: boolean; show_advanced: boolean; show_remarks: boolean };
  isLast: boolean;
  defaultNextName: string;
}) {
  // Read-only: the team name is a snapshot carried on the row from the
  // registration, so the editor shows it but never edits or re-derives it.
  const hasTeams = props.initialRows.some((r) => r.team_name);
  const [rows, setRows] = useState<RosterEntry[]>(props.initialRows);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const locked = props.published || !props.canEdit;

  const update = (i: number, patch: Partial<RosterEntry>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = () =>
    start(async () => {
      const res = await saveResultsAction({
        eventId: props.eventId,
        roundId: props.roundId,
        rows,
      });
      setMsg(res.ok ? "Saved." : res.error ?? "Failed.");
    });

  const proceed = () => {
    const name = window.prompt("Name the next round:", props.defaultNextName);
    if (name === null || name.trim() === "") return;
    start(async () => {
      // On success the action redirects to the new round; only an error returns.
      const res = await proceedToNextRoundAction({
        eventId: props.eventId,
        roundId: props.roundId,
        rows,
        nextName: name,
      });
      if (res && !res.ok) setMsg(res.error);
    });
  };

  return (
    <div style={{ marginTop: 18 }}>
      <p className="body-text" style={{ marginBottom: 10, color: "var(--ink-3)" }}>
        Seeded from: {props.seededFrom} · {props.published ? "published" : "draft"}
      </p>

      <div className="tablewrap">
        <table className="admin">
          <thead>
            <tr>
              <th>Roll</th>
              <th>Name</th>
              {hasTeams ? <th>Team</th> : null}
              <th>Score</th>
              <th>Rank</th>
              <th>Advanced</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ color: "var(--ink-3)" }}>
                  No students seeded. {props.canEdit && !props.published ? "Add rows below." : ""}
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.roll_no}-${i}`}>
                  <td>
                    <input
                      style={{ ...inp, width: 110 }}
                      value={r.roll_no}
                      disabled={locked}
                      placeholder="vtuxxxxx"
                      onChange={(e) => update(i, { roll_no: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      style={{ ...inp, width: 160 }}
                      value={r.display_name ?? ""}
                      disabled={locked}
                      placeholder="Full name"
                      onChange={(e) => update(i, { display_name: e.target.value })}
                    />
                  </td>
                  {hasTeams ? (
                    <td style={{ fontWeight: 500 }}>{r.team_name || "—"}</td>
                  ) : null}
                  <td>
                    <input
                      type="number"
                      style={{ ...inp, width: 80 }}
                      value={r.score ?? ""}
                      disabled={locked}
                      onChange={(e) => {
                        const score = e.target.value === "" ? null : Number(e.target.value);
                        // No score → can't advance (§13.9): clear the flag too.
                        update(i, score === null ? { score, advanced: false } : { score });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      style={{ ...inp, width: 64 }}
                      value={r.rank ?? ""}
                      disabled={locked}
                      onChange={(e) =>
                        update(i, { rank: e.target.value === "" ? null : Number(e.target.value) })
                      }
                    />
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={r.advanced}
                      disabled={locked || r.score === null}
                      title={r.score === null ? "Enter a score before advancing" : undefined}
                      onChange={(e) => update(i, { advanced: e.target.checked })}
                    />
                  </td>
                  <td>
                    <input
                      style={{ ...inp, width: 160 }}
                      value={r.remarks ?? ""}
                      disabled={locked}
                      placeholder="Optional note"
                      onChange={(e) => update(i, { remarks: e.target.value })}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {props.canEdit ? (
        <div
          className="stack"
          style={{ flexDirection: "row", gap: 8, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}
        >
          {!props.published ? (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setRows((rs) => rankByScore(rs))}
              >
                Rank by score
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setRows((rs) => [...rs, emptyRow()])}
              >
                Add row
              </button>
              <button
                type="button"
                className="btn btn-accent btn-sm"
                onClick={save}
                disabled={pending}
              >
                {pending ? "Saving…" : "Save draft"}
              </button>
              <form
                action={publishRoundAction}
                className="stack"
                style={{ flexDirection: "row", gap: 10, alignItems: "center", flexWrap: "wrap" }}
              >
                <input type="hidden" name="eventId" value={props.eventId} />
                <input type="hidden" name="roundId" value={props.roundId} />
                <span className="body-text" style={{ color: "var(--ink-3)" }}>
                  Show publicly:
                </span>
                <label style={chkLabel}>
                  <input type="checkbox" name="show_score" value="1" defaultChecked={props.visibility.show_score} /> Score
                </label>
                <label style={chkLabel}>
                  <input type="checkbox" name="show_advanced" value="1" defaultChecked={props.visibility.show_advanced} /> Advanced
                </label>
                <label style={chkLabel}>
                  <input type="checkbox" name="show_remarks" value="1" defaultChecked={props.visibility.show_remarks} /> Remarks
                </label>
                <button type="submit" className="btn btn-primary btn-sm">
                  Publish
                </button>
              </form>
            </>
          ) : (
            <form action={unpublishRoundAction}>
              <input type="hidden" name="eventId" value={props.eventId} />
              <input type="hidden" name="roundId" value={props.roundId} />
              <button type="submit" className="btn btn-ghost btn-sm">
                Unpublish to edit
              </button>
            </form>
          )}
          {props.isLast ? (
            <button
              type="button"
              className="btn btn-accent btn-sm"
              onClick={proceed}
              disabled={pending}
              title="Save this round and start the next one with the advancing students"
            >
              Proceed to next round →
            </button>
          ) : null}
          {msg ? (
            <span className="body-text" style={{ color: "var(--ink-3)" }}>
              {msg}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
