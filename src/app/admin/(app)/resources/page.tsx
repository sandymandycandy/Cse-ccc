import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, grantFor } from "@/lib/auth/capabilities";
import { listResourcesForAdmin } from "@/lib/admin/resources";
import { resourceKindLabel } from "@/lib/resources";
import { istNumericDate } from "@/lib/datetime";

export default async function AdminResourcesPage() {
  const session = await requireViewPage("manage:resources");
  const items = await listResourcesForAdmin();

  const grant = grantFor(session.role, "manage:resources");
  const canCreate = grant === "all" || (grant === "own" && session.clubId != null);
  // A club-scoped admin only ever manages their own club's rows.
  const visible =
    grant === "own" ? items.filter((r) => r.clubId === session.clubId) : items;

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Content</div>
          <h1 style={{ margin: "6px 0 0" }}>Resources</h1>
        </div>
        {canCreate ? (
          <Link href="/admin/resources/new" className="btn btn-primary">
            Add resource
          </Link>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <div className="cal-empty" style={{ marginTop: 18 }}>No resources yet.</div>
      ) : (
        <div className="tablewrap" style={{ marginTop: 18 }}>
          <table className="admin">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Club</th>
                <th>Updated</th>
                <th>Edit</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>
                    <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--forest)" }}>
                      {r.title} ↗
                    </a>
                  </td>
                  <td>{resourceKindLabel(r.kind)}</td>
                  <td>{r.clubName ?? "Council-wide"}</td>
                  <td>{istNumericDate(r.updatedAt)}</td>
                  <td>
                    {canManage(session, "manage:resources", r.clubId) ? (
                      <Link
                        href={`/admin/resources/${r.id}/edit`}
                        className="label"
                        style={{ color: "var(--forest)" }}
                      >
                        Edit →
                      </Link>
                    ) : (
                      <span className="label" style={{ color: "var(--ink-3)" }}>
                        —
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
