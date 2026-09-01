import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { getCertificateSetup } from "@/lib/admin/certificates";
import { CertificateManager } from "@/components/admin/CertificateManager";

export default async function EventCertificatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireViewPage("issue:participation_certificate");
  const { id } = await params;
  const ev = await getEventForAttendance(id);
  if (!ev) notFound();

  // v1 is an editing surface (setup + issue); read-only viewers (faculty) don't
  // manage certificates, so send them back rather than showing inert controls.
  if (!canManage(session, "issue:participation_certificate", ev.clubId)) {
    redirect("/admin/events");
  }

  const setup = await getCertificateSetup(id);

  return (
    <div className="admin-page">
      <Link
        href={`/admin/events/${id}/registrations`}
        className="label"
        style={{ color: "var(--forest)" }}
      >
        ← Registrations
      </Link>
      <div style={{ marginTop: 14 }}>
        <div className="eyebrow">Participation certificates</div>
        <h1 style={{ margin: "6px 0 0" }}>{ev.title}</h1>
      </div>

      <CertificateManager
        eventId={id}
        templateUrl={setup.templateUrl}
        config={setup.config}
        attendees={setup.attendees}
        issuedCount={setup.issuedCount}
        pendingCount={setup.pendingCount}
        missingEmailCount={setup.missingEmailCount}
      />
    </div>
  );
}
