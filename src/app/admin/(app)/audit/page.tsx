import { requireViewPage } from "@/lib/auth/guards";
import { listAuditLog } from "@/lib/admin/queries";
import { istNumericDate, istTime } from "@/lib/datetime";

const actionLabel = (a: string) => a.replace(/_/g, " ");

export default async function AuditPage() {
  await requireViewPage("view:audit"); // faculty advisor / president / tech head
  const entries = await listAuditLog(100);

  return (
    <div className="admin-page">
      <div className="eyebrow">Security</div>
      <h1 style={{ margin: "6px 0 0" }}>Audit log</h1>
      <p className="lead" style={{ marginTop: 8 }}>
        Every admin mutation, newest first — who did what, and when. The 100 most
        recent entries.
      </p>

      {entries.length === 0 ? (
        <div className="cal-empty" style={{ marginTop: 18 }}>No activity recorded yet.</div>
      ) : (
        <div className="tablewrap" style={{ marginTop: 22 }}>
          <table className="admin">
            <thead>
              <tr>
                <th>When (IST)</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Details</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {istNumericDate(e.at)}
                    <span style={{ color: "var(--ink-3)" }}> · {istTime(e.at)}</span>
                  </td>
                  <td>{e.actor ?? <span style={{ color: "var(--ink-3)" }}>system</span>}</td>
                  <td style={{ textTransform: "capitalize" }}>{actionLabel(e.action)}</td>
                  <td>
                    {e.entity}
                    {e.entityId ? (
                      <span style={{ color: "var(--ink-3)", font: "400 12px var(--mono)" }}>
                        {" "}
                        {e.entityId.slice(0, 8)}
                      </span>
                    ) : null}
                  </td>
                  <td style={{ color: "var(--ink-2)", font: "400 12.5px var(--mono)", maxWidth: 360 }}>
                    {e.summary}
                  </td>
                  <td style={{ color: "var(--ink-3)", font: "400 12px var(--mono)" }}>{e.ip ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
