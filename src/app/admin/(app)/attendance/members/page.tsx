import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { grantFor } from "@/lib/auth/capabilities";
import { canCreateForCapability } from "@/lib/admin/club-scope";
import { listMembers, listPendingMembers, getClubJoinToken } from "@/lib/admin/members";
import { JoinLinkPanel } from "@/components/admin/JoinLinkPanel";
import { MembersTable } from "@/components/admin/MembersTable";
import { onboardMemberAction, rejectMemberAction } from "../actions";

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

  const [members, pending, joinToken] = await Promise.all([
    listMembers(clubId), listPendingMembers(clubId), getClubJoinToken(clubId),
  ]);
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const joinUrl = joinToken ? `${base}/join/${joinToken}` : "";
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

      {canCreate && joinUrl ? <div style={{ marginTop: 16 }}><JoinLinkPanel clubId={clubId} url={joinUrl} /></div> : null}

      {pending.length > 0 ? (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ font: "400 18px var(--serif)", margin: "0 0 8px" }}>Pending approvals ({pending.length})</h2>
          <div className="tablewrap">
            <table className="admin">
              <thead><tr><th>Name</th><th>Roll</th><th></th></tr></thead>
              <tbody>{pending.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 500 }}>{m.name}</td>
                  <td>{m.rollNo ?? "—"}</td>
                  <td style={{ display: "flex", gap: 8 }}>
                    <form action={onboardMemberAction}><input type="hidden" name="id" value={m.id} />
                      <button className="btn btn-sm btn-primary">Onboard</button></form>
                    <form action={rejectMemberAction}><input type="hidden" name="id" value={m.id} />
                      <button className="btn btn-sm" style={{ color: "var(--rust)", borderColor: "var(--rust)" }}>Reject</button></form>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      ) : null}

      <MembersTable members={members} />
    </div>
  );
}
