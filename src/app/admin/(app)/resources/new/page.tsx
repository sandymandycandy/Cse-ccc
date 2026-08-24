import { redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { grantFor } from "@/lib/auth/capabilities";
import { listClubsBrief } from "@/lib/admin/clubs";
import { ResourceForm } from "@/components/admin/ResourceForm";
import { createResourceAction } from "../actions";

export default async function NewResourcePage() {
  const session = await requireViewPage("manage:resources");

  const grant = grantFor(session.role, "manage:resources");
  const canCreate = grant === "all" || (grant === "own" && session.clubId != null);
  if (!canCreate) redirect("/admin/resources");

  // Org-wide managers pick the owning club (or council-wide); a club-scoped
  // admin's resources are pinned to their club, so they get no picker.
  const clubs = grant === "all" ? await listClubsBrief() : undefined;

  return (
    <div className="admin-page" style={{ maxWidth: 640 }}>
      <div className="eyebrow">Content</div>
      <h1 style={{ margin: "6px 0 0" }}>Add resource</h1>
      <p className="lead" style={{ marginTop: 8 }}>
        A titled link — a Drive folder, doc or template — shown on the public
        Resources page.
      </p>
      <ResourceForm action={createResourceAction} clubs={clubs} />
    </div>
  );
}
