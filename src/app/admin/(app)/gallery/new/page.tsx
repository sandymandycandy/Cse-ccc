import { redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { grantFor } from "@/lib/auth/capabilities";
import { canCreateForCapability } from "@/lib/admin/club-scope";
import { listClubsBrief } from "@/lib/admin/clubs";
import { GalleryForm } from "@/components/admin/GalleryForm";
import { createGalleryAction } from "../actions";

export default async function NewGalleryPage() {
  const session = await requireViewPage("manage:content");
  if (!canCreateForCapability(session, "manage:content")) redirect("/admin/gallery");

  // Org-wide managers pick the owning club (or council-wide); a club-scoped
  // admin's photos are pinned to their club, so they get no picker.
  const clubs = grantFor(session.role, "manage:content") === "all" ? await listClubsBrief() : undefined;

  return (
    <div className="admin-page" style={{ maxWidth: 640 }}>
      <div className="eyebrow">Content</div>
      <h1 style={{ margin: "6px 0 0" }}>Add photo</h1>
      <p className="lead" style={{ marginTop: 8 }}>
        Upload an image for the public gallery. Add a caption and a sort order.
      </p>
      <GalleryForm action={createGalleryAction} clubs={clubs} />
    </div>
  );
}
