import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, grantFor } from "@/lib/auth/capabilities";
import { getClubForEdit } from "@/lib/admin/clubs";
import { ClubForm } from "@/components/admin/ClubForm";
import { updateClubAction } from "../../actions";

export default async function EditClubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireViewPage("manage:clubs");
  const { id } = await params;

  const club = await getClubForEdit(id);
  if (!club) notFound();
  // Fail closed: a club-scoped admin may only edit their own club.
  if (!canManage(session, "manage:clubs", club.id)) redirect("/admin/clubs");
  // Only council-wide admins edit structural / identity fields.
  const canEditStructural = grantFor(session.role, "manage:clubs") === "all";

  return (
    <div className="admin-page" style={{ maxWidth: 640 }}>
      <Link href="/admin/clubs" className="label" style={{ color: "var(--forest)" }}>
        ← All clubs
      </Link>
      <h1 style={{ margin: "12px 0 0" }}>Edit {club.name}</h1>
      <p className="lead" style={{ marginTop: 8 }}>
        Update the club&rsquo;s public profile. Changes are live immediately.
      </p>
      <ClubForm
        action={updateClubAction}
        mode="edit"
        canEditStructural={canEditStructural}
        id={club.id}
        initial={{
          name: club.name,
          shortName: club.shortName,
          slug: club.slug,
          category: club.category,
          color: club.color,
          tagline: club.tagline,
          description: club.description,
          isActive: club.isActive,
          isPublic: club.isPublic,
          sort: club.sort,
        }}
      />
    </div>
  );
}
