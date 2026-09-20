import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { listCertificateEvents } from "@/lib/admin/certificates";
import { istFullDate } from "@/lib/datetime";
import { AdminTable, type AdminTableRow } from "@/components/admin/AdminTable";

// Participation certificates hub (BUILD_PLAN §12.6): issuing happens per event,
// from each event's certificates page. This lists every event that has
// attendees so an organiser can jump straight to issuing.
export default async function CertificatesPage() {
  await requireViewPage("issue:participation_certificate");
  const events = await listCertificateEvents();

  const rows: AdminTableRow[] = events.map((e) => {
    const done = e.issued >= e.people && e.people > 0;
    const when = istFullDate(e.startsAt);
    return {
      key: e.id,
      // "What still needs doing" is the only question asked of this screen.
      status: done ? "Issued" : "Outstanding",
      // No `rename`: the title belongs to the event, and is edited there.
      values: [e.title, when, e.people, e.issued],
      cells: [
        e.title,
        when,
        e.people,
        done ? (
          <span key="i" className="abadge abadge-approved">
            {e.issued} / {e.people}
          </span>
        ) : (
          `${e.issued} / ${e.people}`
        ),
        <Link
          key="o"
          href={`/admin/events/${e.id}/certificates`}
          className="btn btn-accent btn-sm"
        >
          Open
        </Link>,
      ],
    };
  });

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Certificates</div>
          <h1 style={{ margin: "8px 0 0" }}>Participation certificates</h1>
        </div>
      </div>
      <p className="admin-lead">
        Pick an event to design its certificate — template, logos, wording and fields — then issue
        everyone their PDF. People counts cover everyone marked <strong>present</strong>, each member of a
        team that attended, and anyone on a list you uploaded.
      </p>

      {events.length === 0 ? (
        <div className="note" style={{ marginTop: 18, maxWidth: 620 }}>
          Nobody to certify yet. Mark people present on an event&rsquo;s registrations page — or upload a
          list of volunteers or judges — then issue certificates from there.
        </div>
      ) : (
        <AdminTable
          heading="Participation certificates"
          noun="event"
          columns={[
            { label: "Event" },
            { label: "Date" },
            { label: "People" },
            { label: "Issued" },
            { label: "Action" },
          ]}
          rows={rows}
        />
      )}
    </div>
  );
}
