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
        <div
          style={{
            marginTop: 18,
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          }}
        >
          {visible.map((g) => (
            <div key={g.id} className="rule" style={{ paddingBottom: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={g.imageUrl}
                alt={g.caption ?? ""}
                style={{ width: "100%", aspectRatio: "3 / 2", objectFit: "cover", borderRadius: 6 }}
              />
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {g.caption || <span style={{ color: "var(--ink-3)" }}>No caption</span>}
                  </div>
                  <div className="label" style={{ color: "var(--ink-3)" }}>
                    {g.clubName ?? "Council-wide"} · #{g.sort}
                  </div>
                </div>
                {canManage(session, "manage:gallery", g.clubId) ? (
                  <Link
                    href={`/admin/gallery/${g.id}/edit`}
                    className="label"
                    style={{ color: "var(--forest)", whiteSpace: "nowrap" }}
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
