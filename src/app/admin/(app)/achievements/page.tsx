import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, grantFor } from "@/lib/auth/capabilities";
import { canCreateForCapability } from "@/lib/admin/club-scope";
import { listAchievementsForAdmin } from "@/lib/admin/achievements";
import { istDateMedium } from "@/lib/datetime";
import { AdminTable, type AdminTableRow } from "@/components/admin/AdminTable";
import { renameAchievementAction } from "./actions";

export default async function AdminAchievementsPage() {
  const session = await requireViewPage("manage:content");
  const items = await listAchievementsForAdmin();

  const canCreate = canCreateForCapability(session, "manage:content");
  const visible =
    grantFor(session.role, "manage:content") === "own"
      ? items.filter((a) => a.clubId === session.clubId)
      : items;

  const rows: AdminTableRow[] = visible.map((a) => {
    const when = a.happenedOn ? istDateMedium(a.happenedOn) : "—";
    const club = a.clubName ?? "Council-wide";
    const mine = canManage(session, "manage:content", a.clubId);

    return {
      key: a.id,
      // Council-wide vs a named club is the axis this list is read along.
      status: club,
      // Only where the edit link is offered, so the two affordances can't
      // disagree about what this admin may touch.
      ...(mine ? { rename: a.title } : {}),
      values: [a.title, when, club],
      cells: [
        a.title,
        when,
        club,
        a.hasImage ? "Yes" : "—",
        mine ? (
          <Link
            key="e"
            href={`/admin/achievements/${a.id}/edit`}
            className="label"
            style={{ color: "var(--forest)" }}
          >
            Edit →
          </Link>
        ) : (
          <span key="e" className="label" style={{ color: "var(--ink-3)" }}>
            —
          </span>
        ),
      ],
    };
  });

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Content</div>
          <h1 style={{ margin: "8px 0 0" }}>Achievements</h1>
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
        <AdminTable
          heading="Achievements"
          noun="achievement"
          columns={[
            { label: "Title" },
            { label: "Date" },
            { label: "Club" },
            { label: "Image" },
            { label: "Edit" },
          ]}
          rows={rows}
          onRename={renameAchievementAction}
        />
      )}
    </div>
  );
}
