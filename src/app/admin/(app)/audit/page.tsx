import { requireViewPage } from "@/lib/auth/guards";
import { listAuditLog } from "@/lib/admin/queries";
import { istNumericDate, istTime } from "@/lib/datetime";
import { AdminTable, type AdminTableRow } from "@/components/admin/AdminTable";

const actionLabel = (a: string) => a.replace(/_/g, " ");

export default async function AuditPage() {
  await requireViewPage("view:audit"); // faculty advisor / president / tech head
  const entries = await listAuditLog(100);

  const rows: AdminTableRow[] = entries.map((e) => ({
    key: e.id,
    // No `rename`: an audit timestamp must not be editable, and the whole
    // point of the log is that it reads the same to everyone.
    values: [istNumericDate(e.at), e.actor, actionLabel(e.action), e.entity, e.summary, e.ip],
    cells: [
      <span key="when">
        {istNumericDate(e.at)}
        <span style={{ color: "var(--ink-3)" }}> · {istTime(e.at)}</span>
      </span>,
      e.actor ?? (
        <span key="actor" style={{ color: "var(--ink-3)" }}>
          system
        </span>
      ),
      <span key="action" style={{ textTransform: "capitalize" }}>
        {actionLabel(e.action)}
      </span>,
      <span key="entity">
        {e.entity}
        {e.entityId ? (
          <span style={{ color: "var(--ink-3)", font: "400 12px var(--mono)" }}>
            {" "}
            {e.entityId.slice(0, 8)}
          </span>
        ) : null}
      </span>,
      <span key="summary" style={{ color: "var(--ink-2)", font: "400 12.5px var(--mono)" }}>
        {e.summary}
      </span>,
      <span key="ip" style={{ color: "var(--ink-3)", font: "400 12px var(--mono)" }}>
        {e.ip ?? "—"}
      </span>,
    ],
  }));

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Security</div>
          <h1 style={{ margin: "8px 0 0" }}>Audit log</h1>
        </div>
      </div>
      <p className="admin-lead">
        Every admin mutation, newest first — who did what, and when. The 100 most
        recent entries.
      </p>

      {entries.length === 0 ? (
        <div className="cal-empty" style={{ marginTop: 18 }}>No activity recorded yet.</div>
      ) : (
        <AdminTable
          heading="Audit log"
          noun="entry"
          nounPlural="entries"
          density="compact"
          columns={[
            { label: "When (IST)" },
            { label: "Actor" },
            { label: "Action" },
            { label: "Entity" },
            { label: "Details", wrap: true },
            { label: "IP" },
          ]}
          rows={rows}
        />
      )}
    </div>
  );
}
