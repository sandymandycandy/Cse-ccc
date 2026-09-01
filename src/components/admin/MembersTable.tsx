"use client";

import Link from "next/link";
import { useState } from "react";
import { matchesQuery } from "@/lib/admin/roster-filter";

interface Member {
  id: string;
  name: string;
  rollNo: string | null;
  isActive: boolean;
}

/** The club members table with a name/roll search box. Edit links stay per-row. */
export function MembersTable({ members }: { members: Member[] }) {
  const [q, setQ] = useState("");
  const filtered = members.filter((m) => matchesQuery(m.name, m.rollNo, q));

  return (
    <div style={{ marginTop: 18 }}>
      <input
        className="search-input"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name or roll…"
        aria-label="Search members by name or roll number"
      />
      {filtered.length === 0 ? (
        <div className="cal-empty">{q ? `No members match “${q}”.` : "No members yet."}</div>
      ) : (
        <div className="tablewrap">
          <table className="admin">
            <thead>
              <tr><th style={{ width: 44 }}>#</th><th>Name</th><th>Roll</th><th>Active</th><th>Edit</th></tr>
            </thead>
            <tbody>
              {filtered.map((m, i) => (
                <tr key={m.id}>
                  <td>{i + 1}</td>
                  <td style={{ fontWeight: 500 }}>{m.name}</td>
                  <td>{m.rollNo ?? "—"}</td>
                  <td>{m.isActive ? "Yes" : "No"}</td>
                  <td>
                    <Link href={`/admin/attendance/members/${m.id}/edit`} className="label" style={{ color: "var(--forest)" }}>
                      Edit →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
