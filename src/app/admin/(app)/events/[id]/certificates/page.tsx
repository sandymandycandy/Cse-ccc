import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { getCertificateWorkspace, listDesignSources } from "@/lib/admin/certificates";
import { certificateFileName } from "@/lib/certificates/recipients";
import { fieldLabel } from "@/lib/certificates/fields";
import { METRICS } from "@/lib/certificates/metrics";
import { recipientWarnings, warningLines } from "@/lib/certificates/warnings";
import { DesignerLoader } from "@/components/admin/certificates/DesignerLoader";
import { GroupBar } from "@/components/admin/certificates/GroupBar";
import { IssuePanel } from "@/components/admin/certificates/IssuePanel";
import { RecipientsPanel, type RecipientRow } from "@/components/admin/certificates/RecipientsPanel";

const CAP = "issue:participation_certificate";
const TABS = [
  { id: "design", label: "Design" },
  { id: "recipients", label: "Recipients" },
  { id: "issue", label: "Issue" },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default async function EventCertificatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; group?: string }>;
}) {
  const session = await requireViewPage(CAP);
  const { id } = await params;
  const { tab: requestedTab, group: requestedGroup } = await searchParams;
  const tab: Tab = TABS.some((t) => t.id === requestedTab) ? (requestedTab as Tab) : "design";

  const ev = await getEventForAttendance(id);
  if (!ev) notFound();
  // An editing surface: read-only viewers (faculty) don't manage certificates.
  if (!canManage(session, CAP, ev.clubId)) redirect("/admin/events");

  const ws = await getCertificateWorkspace(id, session.id, requestedGroup);
  if (!ws) notFound();
  const sources = tab === "design" ? await listDesignSources(session, id) : [];

  const groupSummaries = ws.groups.map((group) => ({
    id: group.id,
    name: group.name,
    kind: group.kind,
    people: ws.recipients.filter((r) => r.groupId === group.id).length,
  }));

  // Warnings are computed with each person's own group design, so a volunteer
  // list with different wording is judged by its own design, not the main one.
  const rows: RecipientRow[] =
    tab === "recipients"
      ? ws.recipients.map((recipient) => {
          const group = ws.groups.find((g) => g.id === recipient.groupId);
          const warnings = group
            ? warningLines(
                recipientWarnings(group.design, (key) => recipient.values[key] ?? "", METRICS),
                (key) => fieldLabel(ws.catalogue, key),
              )
            : [];
          return {
            key: recipient.key,
            groupId: recipient.groupId,
            groupName: recipient.groupLabel,
            kind: recipient.kind,
            name: recipient.name,
            teamLabel: recipient.teamLabel,
            email: recipient.email,
            viaLeader: recipient.viaLeader,
            warnings,
            status: recipient.status,
            filename: certificateFileName(recipient.name, ws.event.title),
          };
        })
      : [];

  return (
    <div className="admin-page cd-page">
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
            href={`/admin/events/${id}/certificates?tab=${t.id}&group=${ws.group.id}`}
            className="chip"
            aria-current={tab === t.id ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab !== "recipients" ? (
        <GroupBar eventId={id} groups={groupSummaries} activeId={ws.group.id} tab={tab} />
      ) : null}

      {tab === "design" ? (
        <div style={{ marginTop: 16 }}>
          <DesignerLoader
            key={ws.group.id}
            eventId={id}
            groupId={ws.group.id}
            initialDesign={ws.editableDesign}
            initialAssetUrls={ws.assetUrls}
            catalogue={ws.catalogue}
            previewRecipients={ws.recipients
              .filter((r) => r.groupId === ws.group.id)
              .map((r) => ({ key: r.key, name: r.name, values: r.values }))}
            issuedCount={ws.counts.issued}
            designSources={sources}
          />
        </div>
      ) : tab === "recipients" ? (
        <RecipientsPanel
          eventId={id}
          rows={rows}
          groups={groupSummaries.map((g) => ({ id: g.id, name: g.name }))}
          canRevoke={canManage(session, "revoke:certificate", ev.clubId)}
        />
      ) : (
        <IssuePanel
          eventId={id}
          groupId={ws.group.id}
          groupName={ws.group.name}
          counts={ws.counts}
          outdated={ws.outdated}
          hasTemplate={!!ws.group.design.page.template}
        />
      )}
    </div>
  );
}
