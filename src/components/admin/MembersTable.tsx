import Link from "next/link";
import { AdminTable, type AdminTableRow } from "./AdminTable";
import { renameMemberAction } from "@/app/admin/(app)/attendance/actions";

interface Member {
  id: string;
  name: string;
  rollNo: string | null;
  isActive: boolean;
}

/**
 * The club members roster.
 *
 * The old hand-rolled search box and the "#" column are gone: `AdminTable`
 * brings the search, and the count line says how many there are, which is all
 * the index was doing here. (The session roster keeps its index, because there
 * the number is a position in the register you read aloud.)
 */
export function MembersTable({ members }: { members: Member[] }) {
  const rows: AdminTableRow[] = members.map((m) => ({
    key: m.id,
    status: m.isActive ? "Active" : "Inactive",
    rename: m.name,
    values: [m.name, m.rollNo, m.isActive ? "Active" : "Inactive"],
    cells: [
      m.name,
      m.rollNo ?? "—",
      m.isActive ? "Yes" : "No",
      <Link
        key="e"
        href={`/admin/attendance/members/${m.id}/edit`}
        className="label"
        style={{ color: "var(--forest)" }}
      >
        Edit →
      </Link>,
    ],
  }));

  if (members.length === 0) {
    return (
      <div className="cal-empty" style={{ marginTop: 18 }}>
        No members yet.
      </div>
    );
  }

  return (
    <AdminTable
      heading="Members"
      noun="member"
      columns={[
        { label: "Name" },
        { label: "Roll" },
        { label: "Active" },
        { label: "Edit" },
      ]}
      rows={rows}
      onRename={renameMemberAction}
    />
  );
}
