import { AdminTable, type AdminTableRow } from "./AdminTable";

interface Row {
  memberId: string;
  name: string;
  rollNo: string | null;
  attended: number;
  eligible: number;
  pct: number;
}

/** Below this, a member is behind enough that the number should say so. Matches
 *  the lowest watchlist threshold on the analytics page above it. */
const AT_RISK_PCT = 50;

/**
 * Per-member attendance for the club.
 *
 * On `AdminTable` for the search, count line and empty state — unlike
 * `SessionHistory`, nothing here is sorted by a column, so there was no reason
 * to keep a hand-rolled toolbar. No `onRename`: this is a reading screen, and
 * members are renamed on the members page.
 *
 * The "#" column the old table carried is gone. It numbered the filtered view,
 * so searching renumbered everybody — and unlike the session roster, this index
 * is never read aloud.
 */
export function AttendanceRoster({ rows }: { rows: Row[] }) {
  const tableRows: AdminTableRow[] = rows.map((r) => ({
    key: r.memberId,
    values: [r.name, r.rollNo, `${r.pct}%`],
    cells: [
      r.name,
      r.rollNo ?? "—",
      r.attended,
      r.eligible,
      <span key="p" className="att-pct" data-risk={r.pct < AT_RISK_PCT}>
        {r.pct}%
      </span>,
    ],
  }));

  return (
    <AdminTable
      heading="Roster attendance"
      noun="member"
      columns={[
        { label: "Member" },
        { label: "Roll", compact: true },
        { label: "Attended", compact: true },
        { label: "Sessions", compact: true },
        { label: "%", compact: true },
      ]}
      rows={tableRows}
    />
  );
}
