import { redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { grantFor } from "@/lib/auth/capabilities";
import { canCreateForCapability } from "@/lib/admin/club-scope";
import { listClubsBrief } from "@/lib/admin/clubs";
import { MemberForm } from "@/components/admin/MemberForm";
import { createMemberAction } from "../../actions";

export default async function NewMemberPage() {
  const session = await requireViewPage("manage:members");
  if (!canCreateForCapability(session, "manage:members")) redirect("/admin/attendance/members");
  const clubs = grantFor(session.role, "manage:members") === "all" ? await listClubsBrief() : undefined;
  return (
    <div className="admin-page" style={{ maxWidth: 620 }}>
      <div className="eyebrow">Attendance</div>
      <h1 style={{ margin: "6px 0 0" }}>Add member</h1>
      <MemberForm action={createMemberAction} clubs={clubs} />
    </div>
  );
}
