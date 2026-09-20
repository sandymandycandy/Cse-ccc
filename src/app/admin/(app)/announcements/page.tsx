import Link from "next/link";
import { redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { listAnnouncementsForAdmin } from "@/lib/admin/announcements";
import { istNumericDate } from "@/lib/datetime";
import { isAnnouncementLive } from "@/lib/announcements/hero";
import { AdminTable, type AdminTableRow } from "@/components/admin/AdminTable";
import { renameAnnouncementAction } from "./actions";

export default async function AdminAnnouncementsPage() {
  const session = await requireViewPage("manage:content");
  // Council-wide content → only org-wide managers (not club-scoped "own" roles).
  if (!canManage(session, "manage:content")) redirect("/admin");

  const items = await listAnnouncementsForAdmin();
  // One clock for the whole table, so two rows can't disagree about "now".
  const now = new Date();

  const rows: AdminTableRow[] = items.map((a) => {
    // Past = published, but its hide-after time has gone by. It has left the
    // public site and stays listed here on purpose.
    const past = a.publishedAt != null && !isAnnouncementLive(a.expiresAt, now);
    const tone = !a.publishedAt ? "pending" : past ? "past" : "approved";
    const status = !a.publishedAt ? "Draft" : past ? "Past" : "Published";
    const hides = a.expiresAt ? istNumericDate(a.expiresAt) : "—";
    const updated = istNumericDate(a.updatedAt);

    return {
      key: a.id,
      status,
      rename: a.title,
      values: [a.title, status, hides, updated],
      cells: [
        a.title,
        <span key="s" className={`abadge abadge-${tone}`}>
          {status}
        </span>,
        <span key="h" style={{ color: a.expiresAt ? undefined : "var(--ink-3)" }}>
          {hides}
        </span>,
        updated,
        <Link
          key="e"
          href={`/admin/announcements/${a.id}/edit`}
          className="label"
          style={{ color: "var(--forest)" }}
        >
          Edit →
        </Link>,
      ],
    };
  });

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Content</div>
          <h1 style={{ margin: "8px 0 0" }}>Announcements</h1>
        </div>
        <Link href="/admin/announcements/new" className="btn btn-primary">
          New announcement
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="cal-empty" style={{ marginTop: 18 }}>No announcements yet.</div>
      ) : (
        <AdminTable
          heading="Announcements"
          noun="announcement"
          columns={[
            { label: "Title" },
            { label: "Status" },
            { label: "Hides after" },
            { label: "Updated" },
            { label: "Edit" },
          ]}
          rows={rows}
          onRename={renameAnnouncementAction}
        />
      )}
    </div>
  );
}
