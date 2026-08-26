import { redirect } from "next/navigation";
import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { grantFor } from "@/lib/auth/capabilities";
import { ClubForm } from "@/components/admin/ClubForm";
import { createClubAction } from "../actions";

export default async function NewClubPage() {
  const session = await requireViewPage("manage:clubs");
  // Creating a club is council-only — club-scoped heads may only edit their own.
  if (grantFor(session.role, "manage:clubs") !== "all") redirect("/admin/clubs");

  return (
    <div className="admin-page" style={{ maxWidth: 640 }}>
      <Link href="/admin/clubs" className="label" style={{ color: "var(--forest)" }}>
        ← All clubs
      </Link>
      <h1 style={{ margin: "12px 0 0" }}>New club</h1>
      <p className="lead" style={{ marginTop: 8 }}>
        Add a club to the council. It goes live on the public site once active.
      </p>
      <ClubForm
        action={createClubAction}
        mode="create"
        canEditStructural
        initial={{
          name: "",
          shortName: "",
          slug: "",
          category: "tech",
          color: "#1f7a4d",
          tagline: null,
          description: null,
          isActive: true,
          sort: 0,
        }}
      />
    </div>
  );
}
