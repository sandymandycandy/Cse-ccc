import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { getCertificateWorkspace, listDesignSources } from "@/lib/admin/certificates";
import { DesignerLoader } from "@/components/admin/certificates/DesignerLoader";
import { IssuePanel } from "@/components/admin/certificates/IssuePanel";

const CAP = "issue:participation_certificate";
const TABS = [
  { id: "design", label: "Design" },
  { id: "issue", label: "Issue" },
] as const;

export default async function EventCertificatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireViewPage(CAP);
  const { id } = await params;
  const { tab: requested } = await searchParams;
  const tab = requested === "issue" ? "issue" : "design";

  const ev = await getEventForAttendance(id);
  if (!ev) notFound();
  // An editing surface: read-only viewers (faculty) don't manage certificates.
  if (!canManage(session, CAP, ev.clubId)) redirect("/admin/events");

  const ws = await getCertificateWorkspace(id, session.id);
  if (!ws) notFound();
  const sources = tab === "design" ? await listDesignSources(session, id) : [];

  return (
    <div className="admin-page">
      <Link href={`/admin/events/${id}/registrations`} className="label" style={{ color: "var(--forest)" }}>
        ← Registrations
      </Link>
      <div style={{ marginTop: 14 }}>
        <div className="eyebrow">Certificates</div>
        <h1 style={{ margin: "6px 0 0" }}>{ev.title}</h1>
      </div>

      <nav className="stack" aria-label="Certificate sections" style={{ marginTop: 16 }}>
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/admin/events/${id}/certificates?tab=${t.id}`}
            className="chip"
            aria-current={tab === t.id ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "design" ? (
        <div style={{ marginTop: 16 }}>
          <DesignerLoader
            eventId={id}
            groupId={ws.group.id}
            initialDesign={ws.editableDesign}
            initialAssetUrls={ws.assetUrls}
            catalogue={ws.catalogue}
            previewRecipients={ws.recipients.map((r) => ({ key: r.key, name: r.name, values: r.values }))}
            issuedCount={ws.counts.issued}
            designSources={sources}
          />
        </div>
      ) : (
        <IssuePanel
          eventId={id}
          rows={ws.recipients.map((r) => ({ key: r.key, name: r.name, email: r.email, status: r.status }))}
          counts={ws.counts}
          hasTemplate={!!ws.group.design.page.template}
        />
      )}
    </div>
  );
}
