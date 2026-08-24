import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, grantFor } from "@/lib/auth/capabilities";
import { getAchievementForEdit } from "@/lib/admin/achievements";
import { listClubsBrief } from "@/lib/admin/clubs";
import { AchievementForm } from "@/components/admin/AchievementForm";
import { DeleteAchievementForm } from "@/components/admin/DeleteAchievementForm";
import { updateAchievementAction } from "../../actions";

export default async function EditAchievementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireViewPage("manage:content");
  const { id } = await params;

  const achievement = await getAchievementForEdit(id);
  if (!achievement) notFound();
  // Fail closed: a club-scoped admin may only edit their own club's rows.
  if (!canManage(session, "manage:content", achievement.clubId)) redirect("/admin/achievements");

  const clubs = grantFor(session.role, "manage:content") === "all" ? await listClubsBrief() : undefined;

  return (
    <div className="admin-page" style={{ maxWidth: 680 }}>
      <div className="eyebrow">Content</div>
      <h1 style={{ margin: "6px 0 0" }}>Edit achievement</h1>
      <p className="lead" style={{ marginTop: 8 }}>
        Update the details or image. Changes are live immediately.
      </p>
      <AchievementForm
        action={updateAchievementAction}
        submitLabel="Save changes"
        id={achievement.id}
        clubs={clubs}
        initial={{
          title: achievement.title,
          description: achievement.description,
          happenedOn: achievement.happenedOn,
          clubId: achievement.clubId,
          imageUrl: achievement.imageUrl,
        }}
      />

      <section className="rule" style={{ marginTop: 32, paddingTop: 24 }}>
        <div className="label" style={{ marginBottom: 6, color: "var(--rust)" }}>
          Delete
        </div>
        <p className="body-text" style={{ fontSize: 13, marginBottom: 10, color: "var(--ink-2)" }}>
          Removes this achievement from the public page and deletes its image.
          This can&rsquo;t be undone.
        </p>
        <DeleteAchievementForm id={achievement.id} />
      </section>
    </div>
  );
}
