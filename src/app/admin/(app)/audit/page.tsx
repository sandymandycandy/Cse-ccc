import { ShieldCheck } from "lucide-react";
import { requireViewPage } from "@/lib/auth/guards";
import { listAuditLog } from "@/lib/admin/queries";
import { AuditLog } from "@/components/admin/AuditLog";

export default async function AuditPage() {
  await requireViewPage("view:audit");
  const entries = await listAuditLog(100);
  return (
    <div className="admin-page audit-page">
      <div className="admin-page-head">
        <div><div className="eyebrow">Security</div><h1>Audit log</h1></div>
        <span className="audit-readonly"><ShieldCheck size={17} aria-hidden="true" /> Read-only history</span>
      </div>
      <p className="admin-lead">Review who changed what and when. Search the latest 100 records, or narrow the activity by action and area.</p>
      <AuditLog entries={entries} />
    </div>
  );
}
