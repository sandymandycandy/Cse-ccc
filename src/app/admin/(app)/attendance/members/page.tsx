import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { grantFor } from "@/lib/auth/capabilities";
import { canCreateForCapability } from "@/lib/admin/club-scope";
import { listMembers } from "@/lib/admin/members";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ club?: string }>;
}) {
  const session = await requireViewPage("manage:members");
  const { club } = await searchParams;
  const grant = grantFor(session.role, "manage:members");
  // Club-scoped admins are pinned to their own club; org-wide pass ?club=.
  const clubId = grant === "own" ? session.clubId : (club ?? null);
  if (!clubId) {
    return (
      <div className="admin-page">
        <div className="eyebrow">Attendance</div>
        <h1 style={{ margin: "6px 0 0" }}>Members</h1>
        <p className="lead" style={{ marginTop: 12 }}>
          Choose a club from the <Link href="/admin/attendance" style={{ color: "var(--forest)" }}>dashboard</Link> to manage its members.
        </p>
      </div>
    );
  }

  const members = await listMembers(clubId);
  const canCreate = canCreateForCapability(session, "manage:members");
  const newHref = grant === "all" ? `/admin/attendance/members/new?club=${clubId}` : "/admin/attendance/members/new";

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Attendance</div>
          <h1 style={{ margin: "6px 0 0" }}>Members</h1>
        </div>
        {canCreate ? <Link href={newHref} className="btn btn-primary">Add member</Link> : null}
      </div>
      {members.length === 0 ? (
        <div className="cal-empty" style={{ marginTop: 18 }}>No members yet.</div>
      ) : (
        <div className="tablewrap" style={{ marginTop: 18 }}>
          <table className="admin">
            <thead><tr><th>Name</th><th>Roll</th><th>Active</th><th>Edit</th></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 500 }}>{m.name}</td>
                  <td>{m.rollNo ?? "—"}</td>
                  <td>{m.isActive ? "Yes" : "No"}</td>
                  <td><Link href={`/admin/attendance/members/${m.id}/edit`} className="label" style={{ color: "var(--forest)" }}>Edit →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
