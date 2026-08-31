import Link from "next/link";
import { redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, canView } from "@/lib/auth/capabilities";
import { listMembers, rosterWithPercent, getJoinToken } from "@/lib/admin/attendance-council";
import { CouncilJoinLinkPanel } from "@/components/admin/CouncilJoinLinkPanel";
import { onboardMemberAction, rejectMemberAction } from "../actions";

export default async function CouncilMembersPage() {
  const session = await requireViewPage("manage:council");
  if (!canView(session, "manage:council")) redirect("/admin");
  const canEdit = canManage(session, "manage:council");

  const [members, roster, joinToken] = await Promise.all([
    listMembers(), rosterWithPercent(), getJoinToken(),
  ]);
  const pending = members.filter((m) => m.approvedAt == null);
  const onboarded = members.filter((m) => m.approvedAt != null);
  const pctByMember = new Map(roster.map((r) => [r.memberId, r.pct]));
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const joinUrl = joinToken ? `${base}/council/join/${joinToken}` : "";

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Council</div>
          <h1 style={{ margin: "6px 0 0" }}>Members</h1>
        </div>
        {canEdit ? <Link href="/admin/council/members/new" className="btn btn-primary">Add member</Link> : null}
      </div>

      {canEdit && joinUrl ? <div style={{ marginTop: 16 }}><CouncilJoinLinkPanel url={joinUrl} /></div> : null}

      {pending.length > 0 ? (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ font: "400 18px var(--serif)", margin: "0 0 8px" }}>Pending approvals ({pending.length})</h2>
          <div className="tablewrap">
            <table className="admin">
              <thead><tr><th>Name</th><th>Role</th><th>Roll</th>{canEdit ? <th></th> : null}</tr></thead>
              <tbody>{pending.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 500 }}>{m.name}</td>
                  <td>{m.designation}</td>
                  <td>{m.rollNo ?? "—"}</td>
                  {canEdit ? (
                    <td style={{ display: "flex", gap: 8 }}>
                      <form action={onboardMemberAction}><input type="hidden" name="id" value={m.id} />
                        <button className="btn btn-sm btn-primary">Onboard</button></form>
                      <form action={rejectMemberAction}><input type="hidden" name="id" value={m.id} />
                        <button className="btn btn-sm" style={{ color: "var(--rust)", borderColor: "var(--rust)" }}>Reject</button></form>
                    </td>
                  ) : null}
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      ) : null}

      {onboarded.length === 0 ? (
        <div className="cal-empty" style={{ marginTop: 18 }}>No council members yet.</div>
      ) : (
        <div className="tablewrap" style={{ marginTop: 18 }}>
          <table className="admin">
            <thead><tr><th style={{ width: 44 }}>#</th><th>Name</th><th>Role</th><th>Roll</th><th>Attendance</th><th>Active</th>{canEdit ? <th>Edit</th> : null}</tr></thead>
            <tbody>
              {onboarded.map((m, i) => (
                <tr key={m.id}>
                  <td>{i + 1}</td>
                  <td style={{ fontWeight: 500 }}>{m.name}</td>
                  <td>{m.designation}</td>
                  <td>{m.rollNo ?? "—"}</td>
                  <td>{pctByMember.has(m.id) ? `${pctByMember.get(m.id)}%` : "—"}</td>
                  <td>{m.isActive ? "Yes" : "No"}</td>
                  {canEdit ? (
                    <td><Link href={`/admin/council/members/${m.id}/edit`} className="label" style={{ color: "var(--forest)" }}>Edit →</Link></td>
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
