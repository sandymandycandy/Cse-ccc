import { redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { CouncilMemberForm } from "@/components/admin/CouncilMemberForm";
import { createMemberAction } from "../../actions";

export default async function NewCouncilMemberPage() {
  const session = await requireViewPage("manage:council");
  if (!canManage(session, "manage:council")) redirect("/admin/council/members");
  return (
    <div className="admin-page" style={{ maxWidth: 620 }}>
      <div className="eyebrow">Council</div>
      <h1 style={{ margin: "6px 0 0" }}>Add member</h1>
      <CouncilMemberForm action={createMemberAction} />
    </div>
  );
}
