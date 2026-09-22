import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, grantFor } from "@/lib/auth/capabilities";
import { getMemberForEdit } from "@/lib/admin/members";
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
  return (
    <div className="admin-page att-form-page">
      <div className="eyebrow">Attendance{member.approvedAt ? "" : " · pending"}</div>
      <h1 className="att-title">Edit member</h1>
      <MemberForm
        action={updateMemberAction}
        submitLabel="Save changes"
        id={member.id}
        clubs={clubs}
        initial={{
          name: member.name, rollNo: member.rollNo ?? "",
          email: member.email ?? "", phone: member.phone ?? "",
          sort: member.sort, isActive: member.isActive, clubId: member.clubId,
        }}
      />
      <section className="rule att-danger">
        <div className="label att-danger-label">Remove</div>
        <DeleteMemberForm id={member.id} />
      </section>
    </div>
  );
}
