import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { listContactMessages } from "@/lib/admin/contact";
import { istNumericDate } from "@/lib/datetime";
import { AdminTable, type AdminTableRow } from "@/components/admin/AdminTable";

export default async function AdminContactPage() {
  await requireViewPage("manage:contact");
  const messages = await listContactMessages();
  const openCount = messages.filter((m) => m.handledAt == null).length;

  const rows: AdminTableRow[] = messages.map((m) => {
    const open = m.handledAt == null;
    const received = istNumericDate(m.createdAt);
    return {
      key: m.id,
      status: open ? "New" : "Handled",
      // No `rename`: a message is what somebody sent, not ours to reword.
      values: [m.name, m.email, m.subject, received, open ? "New" : "Handled"],
      cells: [
        <span key="from" style={{ fontWeight: open ? 600 : 400 }}>
          {m.name}
        </span>,
        // Its own column rather than a sub-line under the name: it is the thing
        // you copy to reply, and it was previously wrapped in the label style,
        // which small-caps an address that has to be read character by character.
        <span key="email" className="contact-email">
          {m.email}
        </span>,
        <span key="subj" style={{ color: "var(--ink-2)" }}>
          {m.subject ?? "—"}
        </span>,
        received,
        <span key="st" className="label" style={{ color: open ? "var(--rust)" : "var(--ink-3)" }}>
          {open ? "● New" : "Handled"}
        </span>,
        <Link
          key="read"
          href={`/admin/contact/${m.id}`}
          className="label"
          style={{ color: "var(--forest)" }}
        >
          Read →
        </Link>,
      ],
    };
  });

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Inbox</div>
          <h1 style={{ margin: "8px 0 0" }}>Contact messages</h1>
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
        <AdminTable
          heading="Contact messages"
          noun="message"
          columns={[
            { label: "From" },
            { label: "Email" },
            { label: "Subject", wrap: true },
            { label: "Received" },
            { label: "Status" },
            { label: "Read" },
          ]}
          rows={rows}
        />
      )}
    </div>
  );
}
