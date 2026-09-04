"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/admin/(app)/actions";
import { groupNavLinks, activeHref, activeLabel, type NavLink } from "@/lib/admin/nav";

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

  const sections = groupNavLinks(links);
  const current = activeHref(links, pathname);
  // Collapsed on a phone the sidebar shows only the brand, so the page you are
  // on has to be named somewhere.
  const here = activeLabel(links, pathname);

  return (
    <aside className="admin-nav" data-open={open ? "true" : "false"}>
      <div className="admin-nav-bar">
        <div className="admin-brand">
          CSE Council
          <span>Admin</span>
        </div>
        {here ? <span className="admin-here">{here}</span> : null}
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
          {sections.map((section, i) => (
            <div className="admin-nav-group" key={section.label ?? `flat-${i}`}>
              {section.label ? (
                <div className="admin-nav-head" aria-hidden="true">
                  {section.label}
                </div>
              ) : null}
              {section.links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={l.href === current ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  {l.label}
                </Link>
              ))}
            </div>
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
