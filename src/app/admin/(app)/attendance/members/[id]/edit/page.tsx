import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, grantFor } from "@/lib/auth/capabilities";
import { getMemberForEdit, memberPhotoUrl } from "@/lib/admin/members";
import { listClubsBrief } from "@/lib/admin/clubs";
import { MemberForm } from "@/components/admin/MemberForm";
import { DeleteMemberForm } from "@/components/admin/DeleteMemberForm";
import { updateMemberAction } from "../../../actions";

export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireViewPage("manage:members");
  const { id } = await params;
  const member = await getMemberForEdit(id);
  if (!member) notFound();
  if (!canManage(session, "manage:members", member.clubId)) redirect("/admin/attendance/members");
  const clubs = grantFor(session.role, "manage:members") === "all" ? await listClubsBrief() : undefined;
  const photoUrl = await memberPhotoUrl(member.photoPath);
  return (
    <div className="admin-page" style={{ maxWidth: 620 }}>
      <div className="eyebrow">Attendance{member.approvedAt ? "" : " · pending"}</div>
      <h1 style={{ margin: "6px 0 0" }}>Edit member</h1>
      <MemberForm
        action={updateMemberAction}
        submitLabel="Save changes"
        id={member.id}
        clubs={clubs}
        initial={{
          name: member.name, rollNo: member.rollNo ?? "",
          email: member.email ?? "", phone: member.phone ?? "",
          sort: member.sort, isActive: member.isActive, clubId: member.clubId, photoUrl,
        }}
      />
      <section className="rule" style={{ marginTop: 24, paddingTop: 24 }}>
        <div className="label" style={{ marginBottom: 6, color: "var(--rust)" }}>Remove</div>
        <DeleteMemberForm id={member.id} />
      </section>
    </div>
  );
}
