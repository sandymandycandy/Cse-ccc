import { redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { AnnouncementForm } from "@/components/admin/AnnouncementForm";
import { createAnnouncementAction } from "../actions";

export default async function NewAnnouncementPage() {
  const session = await requireViewPage("manage:content");
  if (!canManage(session, "manage:content")) redirect("/admin");

  return (
    <div className="admin-page" style={{ maxWidth: 680 }}>
      <div className="eyebrow">Content</div>
      <h1 style={{ margin: "6px 0 0" }}>New announcement</h1>
      <p className="lead" style={{ marginTop: 8 }}>
        Write in Markdown. Leave &ldquo;Published&rdquo; unchecked to save a draft.
      </p>
      <AnnouncementForm action={createAnnouncementAction} />
    </div>
  );
}
