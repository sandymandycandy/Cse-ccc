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
        <div className="tablewrap" style={{ marginTop: 20 }}>
          <table className="admin">
            <thead>
              <tr>
                <th>Event</th>
                <th>Date</th>
                <th>People</th>
                <th>Issued</th>
                <th aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 500 }}>{e.title}</td>
                  <td>{istFullDate(e.startsAt)}</td>
                  <td>{e.people}</td>
                  <td>
                    {e.issued >= e.people && e.people > 0 ? (
                      <span className="abadge abadge-approved">{e.issued} / {e.people}</span>
                    ) : (
                      `${e.issued} / ${e.people}`
                    )}
                  </td>
                  <td>
                    <Link
                      href={`/admin/events/${e.id}/certificates`}
                      className="btn btn-accent btn-sm"
                    >
                      Open
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
