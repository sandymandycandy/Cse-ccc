import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, grantFor } from "@/lib/auth/capabilities";
import { getResourceForEdit, listClubsBrief } from "@/lib/admin/resources";
import { ResourceForm } from "@/components/admin/ResourceForm";
import { DeleteResourceForm } from "@/components/admin/DeleteResourceForm";
import { updateResourceAction } from "../../actions";

export default async function EditResourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireViewPage("manage:resources");
  const { id } = await params;

  const resource = await getResourceForEdit(id);
  if (!resource) notFound();
  // Fail closed: a club-scoped admin may only edit their own club's rows.
  if (!canManage(session, "manage:resources", resource.clubId)) redirect("/admin/resources");

  const clubs = grantFor(session.role, "manage:resources") === "all" ? await listClubsBrief() : undefined;

  return (
    <div className="admin-page" style={{ maxWidth: 640 }}>
      <div className="eyebrow">Content</div>
      <h1 style={{ margin: "6px 0 0" }}>Edit resource</h1>
      <p className="lead" style={{ marginTop: 8 }}>
        Update the link or its details. Changes are live immediately.
      </p>
      <ResourceForm
        action={updateResourceAction}
        submitLabel="Save changes"
        id={resource.id}
        clubs={clubs}
        initial={{
          title: resource.title,
          url: resource.url,
          kind: resource.kind,
          clubId: resource.clubId,
        }}
      />

      <section className="rule" style={{ marginTop: 32, paddingTop: 24 }}>
        <div className="label" style={{ marginBottom: 6, color: "var(--rust)" }}>
          Delete
        </div>
        <p className="body-text" style={{ fontSize: 13, marginBottom: 10, color: "var(--ink-2)" }}>
          Removes this resource from the public page. This can&rsquo;t be undone.
        </p>
        <DeleteResourceForm id={resource.id} />
      </section>
    </div>
  );
}
