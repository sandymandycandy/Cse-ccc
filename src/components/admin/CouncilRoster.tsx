"use client";

import { useState } from "react";
import { matchesQuery } from "@/lib/admin/roster-filter";

interface Row {
  memberId: string;
  name: string;
  rollNo: string | null;
  designation: string;
  attended: number;
  eligible: number;
  pct: number;
}

/** The council roster-attendance table with a name/roll search box. */
export function CouncilRoster({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState("");
  if (rows.length === 0) {
    return <p className="body-text" style={{ color: "var(--ink-3)" }}>No active members yet.</p>;
  }
  const filtered = rows.filter((r) => matchesQuery(r.name, r.rollNo, q));

  return (
    <>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name or roll…"
        aria-label="Search roster by name or roll number"
        style={{ maxWidth: 280, marginBottom: 12 }}
      />
      {filtered.length === 0 ? (
        <p className="body-text" style={{ color: "var(--ink-3)" }}>No members match “{q}”.</p>
      ) : (
        <div className="tablewrap">
          <table className="admin">
            <thead>
              <tr>
                <th style={{ width: 44 }}>#</th><th>Member</th><th>Role</th><th>Roll</th>
                <th>Attended</th><th>Eligible</th><th>%</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.memberId}>
                  <td>{i + 1}</td>
                  <td style={{ fontWeight: 500 }}>{r.name}</td>
                  <td>{r.designation}</td>
                  <td>{r.rollNo ?? "—"}</td>
                  <td>{r.attended}</td>
                  <td>{r.eligible}</td>
                  <td>{r.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
