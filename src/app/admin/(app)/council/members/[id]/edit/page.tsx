import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { getMemberForEdit } from "@/lib/admin/attendance-council";
import { CouncilMemberForm } from "@/components/admin/CouncilMemberForm";
import { CouncilDeleteMemberForm } from "@/components/admin/CouncilDeleteMemberForm";
import { updateMemberAction } from "../../../actions";

export default async function EditCouncilMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireViewPage("manage:council");
  if (!canManage(session, "manage:council")) redirect("/admin/council/members");
  const { id } = await params;
  const member = await getMemberForEdit(id);
  if (!member) notFound();
  return (
    <div className="admin-page" style={{ maxWidth: 620 }}>
      <div className="eyebrow">Council{member.approvedAt ? "" : " · pending"}</div>
      <h1 style={{ margin: "6px 0 0" }}>Edit member</h1>
      <CouncilMemberForm
        action={updateMemberAction}
        submitLabel="Save changes"
        id={member.id}
        initial={{
          name: member.name, designation: member.designation,
          rollNo: member.rollNo ?? "", email: member.email ?? "",
          phone: member.phone ?? "", isActive: member.isActive,
        }}
      />
      <section className="rule" style={{ marginTop: 24, paddingTop: 24 }}>
        <div className="label" style={{ marginBottom: 6, color: "var(--rust)" }}>Remove</div>
        <CouncilDeleteMemberForm id={member.id} />
      </section>
    </div>
  );
}
