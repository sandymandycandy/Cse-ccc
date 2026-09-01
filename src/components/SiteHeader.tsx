"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/events", label: "Events" },
  { href: "/calendar", label: "Calendar" },
  { href: "/clubs", label: "Clubs" },
  { href: "/gallery", label: "Gallery" },
  { href: "/announcements", label: "Announcements" },
  { href: "/team", label: "Team" },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function SiteHeader({
  initialTheme = "day",
}: {
  initialTheme?: "day" | "night";
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-label="CSE Club Council — home">
        <span className="brand-mark" aria-hidden />
        <span className="brand-text">CSE Club Council</span>
      </Link>

      <nav className="site-nav" aria-label="Primary">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={isActive(pathname, l.href) ? "page" : undefined}
          >
            {l.label}
          </Link>
        ))}
      </nav>

      <div className="stack" style={{ gap: 10 }}>
        <ThemeToggle initialTheme={initialTheme} />
        <button
          type="button"
          className="menu-btn"
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          <span aria-hidden>{open ? "✕" : "☰"}</span>
        </button>
      </div>

      {open ? (
        <div
          id="mobile-menu"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "var(--paper-2)",
            borderBottom: "1px solid var(--line)",
            padding: "10px var(--pad) 18px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              aria-current={isActive(pathname, l.href) ? "page" : undefined}
              className={cn("site-nav-mobile-link")}
              style={{
                padding: "12px 4px",
                borderBottom: "1px solid var(--line)",
                color: isActive(pathname, l.href) ? "var(--ink)" : "var(--ink-2)",
                font: "500 15px var(--sans)",
              }}
            >
              {l.label}
            </Link>
          ))}
        </div>
      ) : null}
    </header>
  );
}
