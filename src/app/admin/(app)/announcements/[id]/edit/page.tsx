import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { getAnnouncementForEdit } from "@/lib/admin/announcements";
import { createAdminClient } from "@/lib/supabase/admin";
import { AnnouncementForm } from "@/components/admin/AnnouncementForm";
import { updateAnnouncementAction } from "../../actions";

export default async function EditAnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireViewPage("manage:content");
  if (!canManage(session, "manage:content")) redirect("/admin");

  const { id } = await params;
  const a = await getAnnouncementForEdit(id);
  if (!a) notFound();

  const imageUrl = a.imagePath
    ? createAdminClient().storage.from("announcements").getPublicUrl(a.imagePath).data.publicUrl
    : null;

  return (
    <div className="admin-page" style={{ maxWidth: 680 }}>
      <div className="eyebrow">Content</div>
      <h1 style={{ margin: "6px 0 0" }}>Edit announcement</h1>
      <p className="lead" style={{ marginTop: 8 }}>
        {a.publishedAt ? "This announcement is live." : "This is a draft — publish when ready."}
      </p>
      <AnnouncementForm
        action={updateAnnouncementAction}
        submitLabel="Save changes"
        id={a.id}
        initial={{
          title: a.title,
          body: a.bodyMarkdown,
          published: a.publishedAt != null,
          imageUrl,
        }}
      />
    </div>
  );
}
