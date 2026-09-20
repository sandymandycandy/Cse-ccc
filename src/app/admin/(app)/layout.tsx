import { cookies } from "next/headers";
import { requireAdminPage } from "@/lib/auth/guards";
import { canView, canManage, adminHomePath } from "@/lib/auth/capabilities";
import { AdminNav } from "@/components/admin/AdminNav";
import { ToastProvider } from "@/components/admin/Toaster";
import type { NavLink } from "@/lib/admin/nav";

export default async function AdminAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdminPage();

  // The admin area renders its own chrome, so the root layout's header —
  // and with it the only theme toggle — never reaches these pages. The rail
  // carries one instead, seeded server-side from the same cookie so it
  // hydrates without a flash.
  const theme = (await cookies()).get("theme")?.value === "night" ? "night" : "day";

  // A role whose home isn't the dashboard has no business on it — it's an
  // events surface — so it gets no Dashboard link at all.
  const home = adminHomePath(session.role);

  // Each link carries the section it belongs to. Whether those sections are
  // actually rendered as headings is `groupNavLinks`'s call, not this file's —
  // it depends on how many links the role ends up holding.
  const links: NavLink[] = [
    ...(home === "/admin"
      ? [{ href: "/admin", label: "Dashboard", group: "overview" as const }]
      : []),
    // Council-only (design D1/D2). `manage:council` — NOT `view:analytics`,
    // which club, events and social heads all hold.
    ...(canView(session, "manage:council")
      ? [{ href: "/admin/oversight/clubs", label: "Club health", group: "oversight" as const }]
      : []),
    // Was unconditional, which showed an Events link to roles the page itself
    // redirects away (docs/social heads, and now the gallery manager).
    ...(canView(session, "manage:events")
      ? [{ href: "/admin/events", label: "Events", group: "programme" as const }]
      : []),
    ...(canView(session, "approve:events")
      ? [{ href: "/admin/events/approvals", label: "Approvals", group: "programme" as const }]
      : []),
    ...(canView(session, "issue:participation_certificate")
      ? [{ href: "/admin/certificates", label: "Certificates", group: "programme" as const }]
      : []),
    ...(canManage(session, "manage:content")
      ? [{ href: "/admin/announcements", label: "Announcements", group: "content" as const }]
      : []),
    ...(canView(session, "manage:gallery")
      ? [{ href: "/admin/gallery", label: "Gallery", group: "content" as const }]
      : []),
    ...(canView(session, "manage:content")
      ? [{ href: "/admin/achievements", label: "Achievements", group: "content" as const }]
      : []),
    ...(canView(session, "manage:members")
      ? [{ href: "/admin/attendance", label: "Attendance", group: "people" as const }]
      : []),
    ...(canView(session, "manage:council")
      ? [{ href: "/admin/council", label: "Council", group: "people" as const }]
      : []),
    // Public presentation of the council roster — who shows on /team, and their
    // links. Separate from Council → Members, which is the attendance roster.
    ...(canView(session, "manage:council")
      ? [{ href: "/admin/team", label: "Team page", group: "content" as const }]
      : []),
    ...(canView(session, "manage:resources")
      ? [{ href: "/admin/resources", label: "Resources", group: "people" as const }]
      : []),
    ...(canView(session, "manage:clubs")
      ? [{ href: "/admin/clubs", label: "Clubs", group: "people" as const }]
      : []),
    ...(canView(session, "manage:contact")
      ? [{ href: "/admin/contact", label: "Contact", group: "inbox" as const }]
      : []),
    ...(canView(session, "view:feedback")
      ? [{ href: "/admin/feedback", label: "Feedback", group: "inbox" as const }]
      : []),
    // Both are `manage:broadcast`, but they differ in what they let you do: a
    // club head composes and sees their queued mail, only the council drains it.
    ...(canView(session, "manage:broadcast")
      ? [{ href: "/admin/email", label: "Email", group: "inbox" as const }]
      : []),
    ...(canView(session, "manage:broadcast")
      ? [{ href: "/admin/outbox", label: "Outbox", group: "inbox" as const }]
      : []),
    ...(canView(session, "manage:admins")
      ? [{ href: "/admin/users", label: "Admins", group: "system" as const }]
      : []),
    ...(canView(session, "view:audit")
      ? [{ href: "/admin/audit", label: "Audit", group: "system" as const }]
      : []),
  ];

  return (
    <ToastProvider>
      <div className="admin-shell">
        <AdminNav
          name={session.name}
          role={session.role}
          links={links}
          initialTheme={theme}
        />
        <div className="admin-main">{children}</div>
      </div>
    </ToastProvider>
  );
}
