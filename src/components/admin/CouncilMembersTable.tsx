"use client";

import Link from "next/link";
import { useState } from "react";
import { matchesQuery } from "@/lib/admin/roster-filter";

interface Row {
  id: string;
  name: string;
  rollNo: string | null;
  designation: string;
  pct: number | null;
  isActive: boolean;
}

/** The onboarded council members table with a name/roll search box. */
export function CouncilMembersTable({ rows, canEdit }: { rows: Row[]; canEdit: boolean }) {
  const [q, setQ] = useState("");
  const filtered = rows.filter((r) => matchesQuery(r.name, r.rollNo, q));

  return (
    <div style={{ marginTop: 18 }}>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name or roll…"
        aria-label="Search members by name or roll number"
        style={{ maxWidth: 280, marginBottom: 12 }}
      />
      {filtered.length === 0 ? (
        <div className="cal-empty">{q ? `No members match “${q}”.` : "No council members yet."}</div>
      ) : (
        <div className="tablewrap">
          <table className="admin">
            <thead>
              <tr>
                <th style={{ width: 44 }}>#</th><th>Name</th><th>Role</th><th>Roll</th>
                <th>Attendance</th><th>Active</th>{canEdit ? <th>Edit</th> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((m, i) => (
                <tr key={m.id}>
                  <td>{i + 1}</td>
                  <td style={{ fontWeight: 500 }}>{m.name}</td>
                  <td>{m.designation}</td>
                  <td>{m.rollNo ?? "—"}</td>
                  <td>{m.pct == null ? "—" : `${m.pct}%`}</td>
                  <td>{m.isActive ? "Yes" : "No"}</td>
                  {canEdit ? (
                    <td>
                      <Link href={`/admin/council/members/${m.id}/edit`} className="label" style={{ color: "var(--forest)" }}>
                        Edit →
                      </Link>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
