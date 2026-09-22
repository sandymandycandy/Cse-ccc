"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { activeHref, activeLabel, type NavLink } from "@/lib/admin/nav";

const detailLabels: Record<string, string> = {
  edit: "Edit", new: "New", registrations: "Registrations & attendance",
  participants: "Participants", results: "Results", review: "Review",
  analytics: "Analytics", members: "Members", email: "Email", certificates: "Certificates",
};

export function AdminWorkspaceHeader({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  const current = activeHref(links, pathname);
  const label = activeLabel(links, pathname);
  const detail = detailLabels[pathname.split("/").at(-1) ?? ""] ?? "Details";
  return (
    <header className="admin-workspace-header">
      <nav aria-label="Workspace breadcrumb" className="admin-breadcrumb">
        <span>Workspace</span>
        <ChevronRight size={14} aria-hidden="true" />
        {current && pathname !== current ? (
          <><Link href={current}>{label}</Link><ChevronRight size={14} aria-hidden="true" /><span aria-current="page">{detail}</span></>
        ) : <span aria-current="page">{label ?? "Admin"}</span>}
      </nav>
      <Link href="/" className="admin-site-link">View website <ArrowUpRight size={15} aria-hidden="true" /></Link>
    </header>
  );
}
