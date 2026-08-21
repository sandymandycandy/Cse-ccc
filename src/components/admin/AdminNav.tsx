"use client";

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

  return (
    <aside className="admin-nav">
      <div className="admin-brand">
        CSE Council
        <span>Admin</span>
      </div>

      <nav aria-label="Admin">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active(pathname, l.href) ? "page" : undefined}
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
    </aside>
  );
}
