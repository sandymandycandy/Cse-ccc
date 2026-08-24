import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, grantFor } from "@/lib/auth/capabilities";
import { canCreateForCapability } from "@/lib/admin/club-scope";
import { listAchievementsForAdmin } from "@/lib/admin/achievements";
import { istDateMedium } from "@/lib/datetime";

export default async function AdminAchievementsPage() {
  const session = await requireViewPage("manage:content");
  const items = await listAchievementsForAdmin();

  const canCreate = canCreateForCapability(session, "manage:content");
  const visible =
    grantFor(session.role, "manage:content") === "own"
      ? items.filter((a) => a.clubId === session.clubId)
      : items;

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Content</div>
          <h1 style={{ margin: "6px 0 0" }}>Achievements</h1>
        </div>
        {canCreate ? (
          <Link href="/admin/achievements/new" className="btn btn-primary">
            Add achievement
          </Link>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <div className="cal-empty" style={{ marginTop: 18 }}>No achievements yet.</div>
      ) : (
        <div className="tablewrap" style={{ marginTop: 18 }}>
          <table className="admin">
            <thead>
              <tr>
                <th>Title</th>
                <th>Date</th>
                <th>Club</th>
                <th>Image</th>
                <th>Edit</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 500 }}>{a.title}</td>
                  <td>{a.happenedOn ? istDateMedium(a.happenedOn) : "—"}</td>
                  <td>{a.clubName ?? "Council-wide"}</td>
                  <td>{a.hasImage ? "Yes" : "—"}</td>
                  <td>
                    {canManage(session, "manage:content", a.clubId) ? (
                      <Link
                        href={`/admin/achievements/${a.id}/edit`}
                        className="label"
                        style={{ color: "var(--forest)" }}
                      >
                        Edit →
                      </Link>
                    ) : (
                      <span className="label" style={{ color: "var(--ink-3)" }}>—</span>
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
