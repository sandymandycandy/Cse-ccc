import Link from "next/link";
import { redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { listAnnouncementsForAdmin } from "@/lib/admin/announcements";
import { istNumericDate } from "@/lib/datetime";
import { isAnnouncementLive } from "@/lib/announcements/hero";

export default async function AdminAnnouncementsPage() {
  const session = await requireViewPage("manage:content");
  // Council-wide content → only org-wide managers (not club-scoped "own" roles).
  if (!canManage(session, "manage:content")) redirect("/admin");

  const items = await listAnnouncementsForAdmin();
  // One clock for the whole table, so two rows can't disagree about "now".
  const now = new Date();

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Content</div>
          <h1 style={{ margin: "6px 0 0" }}>Announcements</h1>
        </div>
        <Link href="/admin/announcements/new" className="btn btn-primary">
          New announcement
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="cal-empty" style={{ marginTop: 18 }}>No announcements yet.</div>
      ) : (
        <div className="tablewrap" style={{ marginTop: 18 }}>
          <table className="admin">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Hides after</th>
                <th>Updated</th>
                <th>Edit</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => {
                // Past = published, but its hide-after time has gone by. It has
                // left the public site and stays listed here on purpose.
                const past = a.publishedAt != null && !isAnnouncementLive(a.expiresAt, now);
                const tone = !a.publishedAt ? "pending" : past ? "past" : "approved";
                const status = !a.publishedAt ? "Draft" : past ? "Past" : "Published";
                return (
                <tr key={a.id}>
                  <td style={{ fontWeight: 500 }}>{a.title}</td>
                  <td>
                    <span className={`abadge abadge-${tone}`}>{status}</span>
                  </td>
                  <td style={{ color: a.expiresAt ? undefined : "var(--ink-3)" }}>
                    {a.expiresAt ? istNumericDate(a.expiresAt) : "—"}
                  </td>
                  <td>{istNumericDate(a.updatedAt)}</td>
                  <td>
                    <Link
                      href={`/admin/announcements/${a.id}/edit`}
                      className="label"
                      style={{ color: "var(--forest)" }}
                    >
                      Edit →
                    </Link>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
