import Link from "next/link";
import { AdminTable, type AdminTableRow } from "./AdminTable";
import { renameCouncilMemberAction } from "@/app/admin/(app)/council/actions";

interface Row {
  id: string;
  name: string;
  rollNo: string | null;
  designation: string;
  pct: number | null;
  isActive: boolean;
}

/**
 * The onboarded council members table.
 *
 * Views slice by designation rather than active/inactive: this list is read to
 * find a particular officer far more often than to audit who is switched off.
 */
export function CouncilMembersTable({ rows, canEdit }: { rows: Row[]; canEdit: boolean }) {
  const tableRows: AdminTableRow[] = rows.map((m) => ({
    key: m.id,
    status: m.designation,
    // Renaming is an edit, so it follows the same permission as the edit link.
    ...(canEdit ? { rename: m.name } : {}),
    values: [m.name, m.designation, m.rollNo, m.isActive ? "Active" : "Inactive"],
    cells: [
      m.name,
      m.designation,
      m.rollNo ?? "—",
      m.pct == null ? "—" : `${m.pct}%`,
      m.isActive ? "Yes" : "No",
      ...(canEdit
        ? [
            <Link
              key="e"
              href={`/admin/council/members/${m.id}/edit`}
              className="label"
              style={{ color: "var(--forest)" }}
            >
              Edit →
            </Link>,
          ]
        : []),
    ],
  }));

  if (rows.length === 0) {
    return (
      <div className="cal-empty" style={{ marginTop: 18 }}>
        No council members yet.
      </div>
    );
  }

  return (
    <AdminTable
      heading="Council members"
      noun="member"
      columns={[
        { label: "Name" },
        { label: "Role" },
        { label: "Roll" },
        { label: "Attendance" },
        { label: "Active" },
        ...(canEdit ? [{ label: "Edit" }] : []),
      ]}
      rows={tableRows}
      onRename={canEdit ? renameCouncilMemberAction : undefined}
    />
  );
}
