import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, grantFor } from "@/lib/auth/capabilities";
import { listClubsForAdmin } from "@/lib/admin/clubs";
import { istNumericDate } from "@/lib/datetime";
import { AdminTable, type AdminTableRow } from "@/components/admin/AdminTable";
import { setClubVisibilityAction, renameClubAction } from "./actions";

export default async function AdminClubsPage() {
  const session = await requireViewPage("manage:clubs");
  const clubs = await listClubsForAdmin();

  // A club-scoped admin only ever sees (and edits) their own club's row.
  const grant = grantFor(session.role, "manage:clubs");
  const visible = grant === "own" ? clubs.filter((c) => c.id === session.clubId) : clubs;
  const canCreate = grant === "all";

  const rows: AdminTableRow[] = visible.map((c) => {
    const mine = canManage(session, "manage:clubs", c.id);
    const updated = istNumericDate(c.updatedAt);

    return {
      key: c.id,
      // Public/Hidden is the badge column here, and the one people filter by.
      status: c.isPublic ? "Public" : "Hidden",
      ...(mine ? { rename: c.name } : {}),
      values: [c.name, c.category, c.tagline, c.isPublic ? "Public" : "Hidden", updated],
      cells: [
        c.name,
        c.category,
        <span key="tag" style={{ color: "var(--ink-2)" }}>
          {c.tagline ?? "—"}
        </span>,
        c.isActive ? "Yes" : <span key="a" style={{ color: "var(--rust)" }}>No</span>,
        <span key="pub">
          {c.isPublic ? (
            <span style={{ color: "var(--forest)" }}>Public</span>
          ) : (
            <span style={{ color: "var(--rust)", fontWeight: 500 }}>Hidden</span>
          )}
          {grant === "all" ? (
            <form action={setClubVisibilityAction} style={{ display: "inline" }}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="makePublic" value={c.isPublic ? "false" : "true"} />
              <button type="submit" className="btn btn-sm" style={{ marginLeft: 8 }}>
                {c.isPublic ? "Hide" : "Publish"}
              </button>
            </form>
          ) : null}
        </span>,
        updated,
        mine ? (
          <Link
            key="e"
            href={`/admin/clubs/${c.id}/edit`}
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
          <h1 style={{ margin: "8px 0 0" }}>Clubs</h1>
        </div>
        {canCreate ? (
          <Link href="/admin/clubs/new" className="btn btn-primary">
            New club
          </Link>
        ) : null}
      </div>

      <p className="admin-lead">
        {canCreate
          ? "Add clubs and edit their profile, slug, category, colour and status. Changes go live on the public site immediately."
          : "Edit your club’s name, tagline and description. Changes go live on the public site immediately."}
      </p>

      {visible.length === 0 ? (
        <div className="cal-empty" style={{ marginTop: 18 }}>No clubs to edit.</div>
      ) : (
        <AdminTable
          heading="Clubs"
          noun="club"
          columns={[
            { label: "Club" },
            { label: "Category" },
            { label: "Tagline", wrap: true },
            { label: "Active" },
            { label: "Public" },
            { label: "Updated" },
            { label: "Edit" },
          ]}
          rows={rows}
          onRename={renameClubAction}
        />
      )}
    </div>
  );
}
