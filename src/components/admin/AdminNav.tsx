"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/admin/(app)/actions";

interface NavLink {
  href: string;
  label: string;
}

function active(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

export function AdminNav({
  name,
  role,
  links,
}: {
  name: string;
  role: string;
  links: NavLink[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <aside className="admin-nav" data-open={open ? "true" : "false"}>
      <div className="admin-nav-bar">
        <div className="admin-brand">
          CSE Council
          <span>Admin</span>
        </div>
        <button
          type="button"
          className="admin-nav-toggle"
          aria-expanded={open}
          aria-controls="admin-nav-panel"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
        >
          <span aria-hidden="true">{open ? "✕" : "☰"}</span>
        </button>
      </div>

      <div className="admin-nav-panel" id="admin-nav-panel">
        <nav aria-label="Admin">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active(pathname, l.href) ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="admin-nav-foot">
          <div className="admin-who">
            <strong>{name}</strong>
            <span>{role.replace(/_/g, " ")}</span>
          </div>
          <form action={signOutAction}>
            <button type="submit" className="btn btn-ghost btn-sm w-full">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
