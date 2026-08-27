import Link from "next/link";

const COLS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Explore",
    links: [
      { href: "/events", label: "Events" },
      { href: "/calendar", label: "Calendar" },
      { href: "/clubs", label: "Clubs" },
      { href: "/achievements", label: "Achievements" },
    ],
  },
  {
    title: "Get involved",
    links: [
      { href: "/team", label: "The council" },
      { href: "/resources", label: "Resources" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Students",
    links: [
      { href: "/my-events", label: "My events" },
      { href: "/announcements", label: "Announcements" },
      { href: "/gallery", label: "Gallery" },
      { href: "/about", label: "About" },
    ],
  },
];

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer
      className="rule"
      style={{ marginTop: 64, padding: "40px var(--pad)" }}
    >
      <div className="footer-grid">
        <div>
          <div className="brand" style={{ fontSize: 20 }}>
            CSE Club Council
          </div>
          <p className="body-text" style={{ marginTop: 10, maxWidth: 320 }}>
            The department&rsquo;s eleven clubs, one calendar. Talks, contests,
            workshops and the occasional 24-hour build.
          </p>
        </div>
        {COLS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <div className="label">{col.title}</div>
            <ul style={{ listStyle: "none", marginTop: 12, display: "grid", gap: 9 }}>
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    style={{ color: "var(--ink-2)", font: "400 13.5px var(--sans)" }}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div
        className="rule"
        style={{
          marginTop: 32,
          paddingTop: 20,
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          font: "400 12.5px var(--sans)",
          color: "var(--ink-3)",
        }}
      >
        <span>© {year} CSE Club Council · Department of Computer Science</span>
        <span>Built on the paper system</span>
      </div>
    </footer>
  );
}
