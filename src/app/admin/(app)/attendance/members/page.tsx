import Link from "next/link";
import { Plus, UserRoundPlus } from "lucide-react";
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
        <h1 className="att-title">Members</h1>
        <div className="table-empty att-empty">
          <h2>Pick a club first</h2>
          <p>Choose a club on the dashboard to manage the people in it.</p>
          <Link href="/admin/attendance" className="btn btn-ghost">Go to the dashboard</Link>
        </div>
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
    <div className="admin-page att-page">
      <Link href="/admin/attendance" className="admin-back">
        ← Attendance
      </Link>
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Attendance</div>
          <h1 className="att-title">Members</h1>
        </div>
        {canCreate ? (
          <Link href={newHref} className="btn btn-primary">
            <Plus size={17} aria-hidden="true" /> Add member
          </Link>
        ) : null}
      </div>
      <p className="admin-lead">
        Everyone who can be marked present. People who join through the link wait
        here until someone onboards them.
      </p>

      {canCreate && joinUrl ? <JoinLinkPanel clubId={clubId} url={joinUrl} /> : null}

      {/* Pending sits ABOVE the roster and keeps its own table: it is a queue of
          decisions, not a list to browse, so it gets no search and no chips. */}
      {pending.length > 0 ? (
        <section className="att-panel" aria-labelledby="pending-title">
          <div className="att-panel-head">
            <div>
              <span className="dashboard-kicker">Waiting for you</span>
              <h2 id="pending-title">Pending approvals ({pending.length})</h2>
            </div>
            <UserRoundPlus size={21} aria-hidden="true" />
          </div>
          <div className="tablewrap cards">
            <table className="admin" data-density="comfortable" aria-label="Pending approvals">
              <thead><tr><th>Name</th><th>Roll</th><th>Decision</th></tr></thead>
              <tbody>{pending.map((m) => (
                <tr key={m.id}>
                  <td data-primary="" className="att-row-title">{m.name}</td>
                  <td data-label="Roll">{m.rollNo ?? "—"}</td>
                  <td data-action="" className="att-decide">
                    <form action={onboardMemberAction}><input type="hidden" name="id" value={m.id} />
                      <button className="btn btn-sm btn-primary">Onboard</button></form>
                    <form action={rejectMemberAction}><input type="hidden" name="id" value={m.id} />
                      <button className="btn btn-sm att-reject">Reject</button></form>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      ) : null}

      <h2 className="att-section-title">Roster</h2>
      <MembersTable members={members} />
    </div>
  );
}
