import { notFound } from "next/navigation";
import { DesignerHarness } from "@/components/admin/certificates/DesignerHarness";

/**
 * Development-only harness for the certificate designer: the real editor with
 * sample data and no login, so it can be exercised in a browser locally. Saving,
 * uploads and PDF preview are disabled here. 404 in production.
 */
export default function CertificateDesignerHarnessPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="admin-page">
      <div className="eyebrow">Dev harness</div>
      <h1 style={{ margin: "6px 0 16px" }}>Certificate designer</h1>
      <DesignerHarness />
    </div>
  );
}
