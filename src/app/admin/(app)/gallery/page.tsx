import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, grantFor } from "@/lib/auth/capabilities";
import { canCreateForCapability } from "@/lib/admin/club-scope";
import { listGalleryForAdmin } from "@/lib/admin/gallery";

export default async function AdminGalleryPage() {
  const session = await requireViewPage("manage:gallery");
  const items = await listGalleryForAdmin();

  const canCreate = canCreateForCapability(session, "manage:gallery");
  // A club-scoped admin only ever manages their own club's photos.
  const visible =
    grantFor(session.role, "manage:gallery") === "own"
      ? items.filter((g) => g.clubId === session.clubId)
      : items;

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Content</div>
          <h1 style={{ margin: "6px 0 0" }}>Gallery</h1>
        </div>
        {canCreate ? (
          <Link href="/admin/gallery/new" className="btn btn-primary">
            Add photo
          </Link>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <div className="cal-empty" style={{ marginTop: 18 }}>No photos yet.</div>
      ) : (
        <div className="admin-gallery-grid">
          {visible.map((g) => (
            <div key={g.id} className="admin-gallery-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={g.imageUrl}
                alt={g.caption ?? ""}
              />
              <div className="admin-gallery-caption">
                <div>
                  <strong title={g.caption ?? undefined}>
                    {g.caption || "No caption"}
                  </strong>
                  <small>
                    {g.clubName ?? "Council-wide"} · #{g.sort}
                  </small>
                </div>
                {canManage(session, "manage:gallery", g.clubId) ? (
                  <Link
                    href={`/admin/gallery/${g.id}/edit`}
                    aria-label={`Edit ${g.caption || "photo"}`}
                  >
                    Edit →
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
