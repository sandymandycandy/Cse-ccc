import Link from "next/link";
import { notFound } from "next/navigation";
import { DesignerHarness } from "@/components/admin/certificates/DesignerHarness";
import { IssueHarness } from "@/components/admin/certificates/IssueHarness";
import { RecipientsHarness } from "@/components/admin/certificates/RecipientsHarness";

/**
 * Development-only harness for the certificate pages: the real editor and the
 * real Recipients table with sample data and no login, so they can be exercised
 * in a browser locally. Saving, uploads, PDF preview and the row actions all
 * need a real session and will refuse. 404 in production.
 */
const PANELS = [
  { id: "design", label: "Designer" },
  { id: "recipients", label: "Recipients" },
  { id: "issue", label: "Issue" },
] as const;

export default async function CertificateDesignerHarnessPage({
  searchParams,
}: {
  searchParams: Promise<{ panel?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { panel } = await searchParams;
  const active = PANELS.some((p) => p.id === panel) ? (panel as (typeof PANELS)[number]["id"]) : "design";

  return (
    <div className="admin-page cd-page">
      <div className="eyebrow">Dev harness</div>
      <h1 style={{ margin: "6px 0 12px" }}>Certificates</h1>
      <nav className="stack" aria-label="Harness panels" style={{ marginBottom: 8 }}>
        {PANELS.map((p) => (
          <Link
            key={p.id}
            href={`/dev/certificate-designer?panel=${p.id}`}
            className="chip"
            aria-current={active === p.id ? "page" : undefined}
          >
            {p.label}
          </Link>
        ))}
      </nav>
      {active === "recipients" ? <RecipientsHarness /> : active === "issue" ? <IssueHarness /> : <DesignerHarness />}
    </div>
  );
}
