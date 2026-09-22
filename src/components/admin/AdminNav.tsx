"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, LogOut, Menu, Search, X } from "lucide-react";
import { AdminIcon } from "./AdminIcon";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/admin/(app)/actions";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  groupNavLinks,
  activeHref,
  activeLabel,
  filterNavSections,
  isGroupOpen,
  type NavLink,
} from "@/lib/admin/nav";

/** Which groups the user has folded away. Survives navigation and reloads —
 *  a tech head with six sections shouldn't re-fold them on every page. */
const COLLAPSE_KEY = "admin-nav-collapsed";

/* localStorage is an external store, so it is read through
   `useSyncExternalStore` rather than copied into state by an effect: that
   keeps the server render ("{}" — everything expanded) and the first client
   render consistent, and it picks up a change made in another tab for free. */
const listeners = new Set<() => void>();

function subscribeCollapse(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readCollapse(): string {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) ?? "{}";
  } catch {
    // Private mode, or storage blocked. An all-expanded nav is the right
    // thing to fall back to.
    return "{}";
  }
}

/** The server has no localStorage, so it always renders every group open. */
function serverCollapse(): string {
  return "{}";
}

function writeCollapse(next: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
  } catch {
    // Persistence is a nicety; the toggle still works for this session.
  }
  // `storage` only fires in *other* tabs, so this one has to be told.
  listeners.forEach((l) => l());
}

export function AdminNav({
  name,
  role,
  links,
  initialTheme = "day",
}: {
  name: string;
  role: string;
  links: NavLink[];
  initialTheme?: "day" | "night";
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [navQuery, setNavQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const rawCollapse = useSyncExternalStore(subscribeCollapse, readCollapse, serverCollapse);
  const collapsed = useMemo<Record<string, boolean>>(() => {
    try {
      const parsed: unknown = JSON.parse(rawCollapse);
      // Someone hand-editing the key into an array or a string shouldn't cost
      // them the sidebar.
      return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, boolean>)
        : {};
    } catch {
      return {};
    }
  }, [rawCollapse]);

  function toggleGroup(label: string) {
    writeCollapse({ ...collapsed, [label]: !collapsed[label] });
  }

  const current = activeHref(links, pathname);
  // Collapsed on a phone the sidebar shows only the brand, so the page you are
  // on has to be named somewhere.
  const here = activeLabel(links, pathname);

  const sections = filterNavSections(groupNavLinks(links), navQuery);
  const navEmpty = sections.length === 0;

  return (
    <aside className="admin-nav" data-open={open ? "true" : "false"} onKeyDown={(event) => {
      if (event.key === "Escape") {
        if (navQuery) { setNavQuery(""); searchRef.current?.focus(); }
        else if (open) { setOpen(false); menuRef.current?.focus(); }
      }
    }}>
      <div className="admin-nav-bar">
        <div className="admin-brand">
          CSE Council
          <span>Admin workspace</span>
        </div>
        {here ? <span className="admin-here">{here}</span> : null}
        <ThemeToggle initialTheme={initialTheme} variant="rail" />
        <button
          ref={menuRef}
          type="button"
          className="admin-nav-toggle"
          aria-expanded={open}
          aria-controls="admin-nav-panel"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
      </div>

      <div className="admin-nav-panel" id="admin-nav-panel">
        <div className="admin-nav-search">
        <Search size={16} aria-hidden="true" />
        <input
          ref={searchRef}
          className="admin-nav-filter"
          type="search"
          value={navQuery}
          onChange={(e) => setNavQuery(e.target.value)}
          placeholder="Find a page…"
          aria-label="Filter menu"
          aria-keyshortcuts="Control+k Meta+k"
        />
        {navQuery ? <button type="button" aria-label="Clear menu search" onClick={() => { setNavQuery(""); searchRef.current?.focus(); }}><X size={14} aria-hidden="true" /></button> : <kbd title="Control or Command + K">⌘ K</kbd>}
        </div>

        <nav aria-label="Admin">
          {sections.map((section, i) => {
            const expanded = isGroupOpen({ section, current, query: navQuery, collapsed });
            return (
              <div className="admin-nav-group" key={section.label ?? `flat-${i}`}>
                {section.label ? (
                  <button
                    type="button"
                    className="admin-nav-head"
                    aria-expanded={expanded}
                    onClick={() => toggleGroup(section.label as string)}
                  >
                    <span>{section.label}</span>
                    <ChevronDown size={12} className="admin-nav-caret" data-open={expanded} aria-hidden="true" />
                  </button>
                ) : null}
                {expanded
                  ? section.links.map((l) => (
                      <Link
                        key={l.href}
                        href={l.href}
                        aria-current={l.href === current ? "page" : undefined}
                        onClick={() => { setOpen(false); setNavQuery(""); }}
                      >
                        <AdminIcon href={l.href} /><span>{l.label}</span>
                      </Link>
                    ))
                  : null}
              </div>
            );
          })}
          {navEmpty ? (
            <p className="admin-nav-nomatch">No menu item matches that.</p>
          ) : null}
        </nav>

        <div className="admin-nav-foot">
          <div className="admin-profile">
          <span className="admin-avatar" aria-hidden="true">{name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span>
          <div className="admin-who">
            <strong>{name}</strong>
            <span>{role.replace(/_/g, " ")}</span>
          </div>
          </div>
          <form action={signOutAction}>
            <button type="submit" className="btn btn-ghost btn-sm w-full">
              <LogOut size={15} aria-hidden="true" /> Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
