import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, grantFor } from "@/lib/auth/capabilities";
import { listResourcesForAdmin } from "@/lib/admin/resources";
import { resourceKindLabel } from "@/lib/resources";
import { istNumericDate } from "@/lib/datetime";
import { AdminTable, type AdminTableRow } from "@/components/admin/AdminTable";
import { renameResourceAction } from "./actions";

export default async function AdminResourcesPage() {
  const session = await requireViewPage("manage:resources");
  const items = await listResourcesForAdmin();

  const grant = grantFor(session.role, "manage:resources");
  const canCreate = grant === "all" || (grant === "own" && session.clubId != null);
  // A club-scoped admin only ever manages their own club's rows.
  const visible =
    grant === "own" ? items.filter((r) => r.clubId === session.clubId) : items;

  const rows: AdminTableRow[] = visible.map((r) => {
    const kind = resourceKindLabel(r.kind);
    const club = r.clubName ?? "Council-wide";
    const updated = istNumericDate(r.updatedAt);
    // This screen has no badge column, so the view chips slice by type — the
    // one categorical axis a resource list is actually read along.
    const mine = canManage(session, "manage:resources", r.clubId);

    return {
      key: r.id,
      status: kind,
      // Only offer the pencil where the edit link is offered, so the two
      // affordances can't disagree about what this admin may touch.
      ...(mine ? { rename: r.title } : {}),
      values: [r.title, kind, club, updated],
      cells: [
        <a
          key="t"
          href={r.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--forest)" }}
        >
          {r.title} ↗
        </a>,
        kind,
        club,
        updated,
        mine ? (
          <Link
            key="e"
            href={`/admin/resources/${r.id}/edit`}
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
          <h1 style={{ margin: "8px 0 0" }}>Resources</h1>
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
        <AdminTable
          heading="Resources"
          noun="resource"
          columns={[
            { label: "Title" },
            { label: "Type" },
            { label: "Club" },
            { label: "Updated" },
            { label: "Edit" },
          ]}
          rows={rows}
          onRename={renameResourceAction}
        />
      )}
    </div>
  );
}
