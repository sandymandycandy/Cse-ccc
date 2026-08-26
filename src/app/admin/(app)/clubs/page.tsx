import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, grantFor } from "@/lib/auth/capabilities";
import { listClubsForAdmin } from "@/lib/admin/clubs";
import { istNumericDate } from "@/lib/datetime";

export default async function AdminClubsPage() {
  const session = await requireViewPage("manage:clubs");
  const clubs = await listClubsForAdmin();

  // A club-scoped admin only ever sees (and edits) their own club's row.
  const grant = grantFor(session.role, "manage:clubs");
  const visible = grant === "own" ? clubs.filter((c) => c.id === session.clubId) : clubs;
  const canCreate = grant === "all";

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Content</div>
          <h1 style={{ margin: "6px 0 0" }}>Clubs</h1>
        </div>
        {canCreate ? (
          <Link href="/admin/clubs/new" className="btn btn-primary">
            New club
          </Link>
        ) : null}
      </div>

      <p className="lead" style={{ marginTop: 8 }}>
        {canCreate
          ? "Add clubs and edit their profile, slug, category, colour and status. Changes go live on the public site immediately."
          : "Edit your club’s name, tagline and description. Changes go live on the public site immediately."}
      </p>

      {visible.length === 0 ? (
        <div className="cal-empty" style={{ marginTop: 18 }}>No clubs to edit.</div>
      ) : (
        <div className="tablewrap" style={{ marginTop: 18 }}>
          <table className="admin">
            <thead>
              <tr>
                <th>Club</th>
                <th>Category</th>
                <th>Tagline</th>
                <th>Active</th>
                <th>Updated</th>
                <th>Edit</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td>{c.category}</td>
                  <td style={{ color: "var(--ink-2)" }}>{c.tagline ?? "—"}</td>
                  <td>{c.isActive ? "Yes" : <span style={{ color: "var(--rust)" }}>No</span>}</td>
                  <td>{istNumericDate(c.updatedAt)}</td>
                  <td>
                    {canManage(session, "manage:clubs", c.id) ? (
                      <Link
                        href={`/admin/clubs/${c.id}/edit`}
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
