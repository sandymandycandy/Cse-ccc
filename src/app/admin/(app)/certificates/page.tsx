import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { listCertificateEvents } from "@/lib/admin/certificates";
import { istFullDate } from "@/lib/datetime";

// Participation certificates hub (BUILD_PLAN §12.6): issuing happens per event,
// from each event's certificates page. This lists every event that has
// attendees so an organiser can jump straight to issuing.
export default async function CertificatesPage() {
  await requireViewPage("issue:participation_certificate");
  const events = await listCertificateEvents();

  return (
    <div className="admin-page">
      <div className="eyebrow">Certificates</div>
      <h1 style={{ margin: "6px 0 0" }}>Participation certificates</h1>
      <p className="body-text" style={{ marginTop: 8, maxWidth: 620 }}>
        Pick an event to upload its certificate template, position the name and email
        every attendee their PDF. Only people marked <strong>present</strong> appear.
      </p>

      {events.length === 0 ? (
        <div className="note" style={{ marginTop: 18, maxWidth: 620 }}>
          No events have attendees yet. Mark people present on an event&rsquo;s
          registrations page, then issue certificates from there.
        </div>
      ) : (
        <div className="tablewrap" style={{ marginTop: 20 }}>
          <table className="admin">
            <thead>
              <tr>
                <th>Event</th>
                <th>Date</th>
                <th>Attended</th>
                <th>Issued</th>
                <th aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 500 }}>{e.title}</td>
                  <td>{istFullDate(e.startsAt)}</td>
                  <td>{e.attended}</td>
                  <td>
                    {e.issued >= e.attended && e.attended > 0 ? (
                      <span className="abadge abadge-approved">{e.issued} / {e.attended}</span>
                    ) : (
                      `${e.issued} / ${e.attended}`
                    )}
                  </td>
                  <td>
                    <Link
                      href={`/admin/events/${e.id}/certificates`}
                      className="btn btn-accent btn-sm"
                    >
                      Issue
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
