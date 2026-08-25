import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, grantFor } from "@/lib/auth/capabilities";
import { getMemberForEdit, isMemberActivated } from "@/lib/admin/members";
import { listClubsBrief } from "@/lib/admin/clubs";
import { MemberForm } from "@/components/admin/MemberForm";
import { DeleteMemberForm } from "@/components/admin/DeleteMemberForm";
import { MemberQrCard } from "@/components/admin/MemberQrCard";
import { MemberLoginAccess } from "@/components/admin/MemberLoginAccess";
import { updateMemberAction, generateMemberLinkAction, resetMemberAccessAction } from "../../../actions";

export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireViewPage("manage:members");
  const { id } = await params;
  const member = await getMemberForEdit(id);
  if (!member) notFound();
  if (!canManage(session, "manage:members", member.clubId)) redirect("/admin/attendance/members");
  const clubs = grantFor(session.role, "manage:members") === "all" ? await listClubsBrief() : undefined;
  return (
    <div className="admin-page" style={{ maxWidth: 620 }}>
      <div className="eyebrow">Attendance</div>
      <h1 style={{ margin: "6px 0 0" }}>Edit member</h1>
      <MemberForm
        action={updateMemberAction}
        submitLabel="Save changes"
        id={member.id}
        clubs={clubs}
        initial={{
          name: member.name, rollNo: member.rollNo ?? "",
          email: member.email ?? "", phone: member.phone ?? "", role: member.role,
          sort: member.sort, isActive: member.isActive, clubId: member.clubId,
        }}
      />
      <section className="rule" style={{ marginTop: 32, paddingTop: 24 }}>
        <h2 style={{ font: "400 18px var(--serif)", margin: "0 0 12px" }}>QR card</h2>
        <MemberQrCard memberId={member.id} name={member.name} />
        <p className="body-text" style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 10 }}>
          Print or share this. A head scans it to mark attendance; the member can open it to see their record.
        </p>
      </section>
      {member.email ? (
        <section className="rule" style={{ marginTop: 24, paddingTop: 24 }}>
          <h2 style={{ font: "400 18px var(--serif)", margin: "0 0 12px" }}>Login access</h2>
          <MemberLoginAccess
            memberId={member.id}
            activated={await isMemberActivated(member.id)}
            generate={generateMemberLinkAction}
            reset={resetMemberAccessAction}
          />
        </section>
      ) : null}
      <section className="rule" style={{ marginTop: 24, paddingTop: 24 }}>
        <div className="label" style={{ marginBottom: 6, color: "var(--rust)" }}>Remove</div>
        <DeleteMemberForm id={member.id} />
      </section>
    </div>
  );
}
