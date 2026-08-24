import { redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { grantFor } from "@/lib/auth/capabilities";
import { canCreateForCapability } from "@/lib/admin/club-scope";
import { listClubsBrief } from "@/lib/admin/clubs";
import { AchievementForm } from "@/components/admin/AchievementForm";
import { createAchievementAction } from "../actions";

export default async function NewAchievementPage() {
  const session = await requireViewPage("manage:content");
  if (!canCreateForCapability(session, "manage:content")) redirect("/admin/achievements");

  const clubs = grantFor(session.role, "manage:content") === "all" ? await listClubsBrief() : undefined;

  return (
    <div className="admin-page" style={{ maxWidth: 680 }}>
      <div className="eyebrow">Content</div>
      <h1 style={{ margin: "6px 0 0" }}>Add achievement</h1>
      <p className="lead" style={{ marginTop: 8 }}>
        A win, award or standout project for the public Achievements page.
      </p>
      <AchievementForm action={createAchievementAction} clubs={clubs} />
    </div>
  );
}
