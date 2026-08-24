import { requireAdminPage } from "@/lib/auth/guards";
import { canView, canManage } from "@/lib/auth/capabilities";
import { AdminNav } from "@/components/admin/AdminNav";

export default async function AdminAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdminPage();

  const links = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/events", label: "Events" },
    ...(canView(session, "approve:events")
      ? [{ href: "/admin/events/approvals", label: "Approvals" }]
      : []),
    ...(canView(session, "issue:participation_certificate")
      ? [{ href: "/admin/certificates", label: "Certificates" }]
      : []),
    ...(canManage(session, "manage:content")
      ? [{ href: "/admin/announcements", label: "Announcements" }]
      : []),
    ...(canView(session, "manage:admins")
      ? [{ href: "/admin/users", label: "Admins" }]
      : []),
    ...(canView(session, "view:audit")
      ? [{ href: "/admin/audit", label: "Audit" }]
      : []),
  ];

  return (
    <div className="admin-shell">
      <AdminNav name={session.name} role={session.role} links={links} />
      <div className="admin-main">{children}</div>
    </div>
  );
}
