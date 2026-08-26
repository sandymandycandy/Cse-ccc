import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { listContactMessages } from "@/lib/admin/contact";
import { istNumericDate } from "@/lib/datetime";

export default async function AdminContactPage() {
  await requireViewPage("manage:contact");
  const messages = await listContactMessages();
  const openCount = messages.filter((m) => m.handledAt == null).length;

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Inbox</div>
          <h1 style={{ margin: "6px 0 0" }}>Contact messages</h1>
        </div>
        {messages.length > 0 ? (
          <span className="label" style={{ color: "var(--ink-2)" }}>
            {openCount} unhandled
          </span>
        ) : null}
      </div>

      {messages.length === 0 ? (
        <div className="cal-empty" style={{ marginTop: 18 }}>No messages yet.</div>
      ) : (
        <div className="tablewrap" style={{ marginTop: 18 }}>
          <table className="admin">
            <thead>
              <tr>
                <th>From</th>
                <th>Subject</th>
                <th>Received</th>
                <th>Status</th>
                <th>Read</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => {
                const open = m.handledAt == null;
                return (
                  <tr key={m.id}>
                    <td style={{ fontWeight: open ? 600 : 400 }}>
                      {m.name}
                      <div className="label" style={{ color: "var(--ink-3)" }}>{m.email}</div>
                    </td>
                    <td style={{ color: "var(--ink-2)" }}>{m.subject ?? "—"}</td>
                    <td>{istNumericDate(m.createdAt)}</td>
                    <td>
                      <span
                        className="label"
                        style={{ color: open ? "var(--rust)" : "var(--ink-3)" }}
                      >
                        {open ? "● New" : "Handled"}
                      </span>
                    </td>
                    <td>
                      <Link
                        href={`/admin/contact/${m.id}`}
                        className="label"
                        style={{ color: "var(--forest)" }}
                      >
                        Read →
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
