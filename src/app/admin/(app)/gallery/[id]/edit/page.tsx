import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, grantFor } from "@/lib/auth/capabilities";
import { getGalleryForEdit } from "@/lib/admin/gallery";
import { listClubsBrief } from "@/lib/admin/clubs";
import { GalleryForm } from "@/components/admin/GalleryForm";
import { DeleteGalleryForm } from "@/components/admin/DeleteGalleryForm";
import { updateGalleryAction } from "../../actions";

export default async function EditGalleryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireViewPage("manage:gallery");
  const { id } = await params;

  const photo = await getGalleryForEdit(id);
  if (!photo) notFound();
  // Fail closed: a club-scoped admin may only edit their own club's photos.
  if (!canManage(session, "manage:gallery", photo.clubId)) redirect("/admin/gallery");

  const clubs = grantFor(session.role, "manage:gallery") === "all" ? await listClubsBrief() : undefined;

  return (
    <div className="admin-page" style={{ maxWidth: 640 }}>
      <div className="eyebrow">Content</div>
      <h1 style={{ margin: "6px 0 0" }}>Edit photo</h1>
      <p className="lead" style={{ marginTop: 8 }}>
        Update the caption, order or club — or replace the image. Changes are live
        immediately.
      </p>
      <GalleryForm
        action={updateGalleryAction}
        submitLabel="Save changes"
        id={photo.id}
        clubs={clubs}
        initial={{
          caption: photo.caption ?? "",
          sort: photo.sort,
          clubId: photo.clubId,
          imageUrl: photo.imageUrl,
        }}
      />

      <section className="rule" style={{ marginTop: 32, paddingTop: 24 }}>
        <div className="label" style={{ marginBottom: 6, color: "var(--rust)" }}>
          Delete
        </div>
        <p className="body-text" style={{ fontSize: 13, marginBottom: 10, color: "var(--ink-2)" }}>
          Removes this photo from the gallery and deletes the image. This can&rsquo;t
          be undone.
        </p>
        <DeleteGalleryForm id={photo.id} />
      </section>
    </div>
  );
}
