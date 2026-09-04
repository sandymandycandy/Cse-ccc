import { describe, it, expect } from "vitest";
import {
  groupNavLinks,
  activeHref,
  activeLabel,
  GROUPING_THRESHOLD,
  type NavLink,
} from "./nav";

const link = (href: string, label: string, group: NavLink["group"]): NavLink => ({
  href,
  label,
  group,
});

// The full set a president sees, in the order the layout builds it.
const FULL: NavLink[] = [
  link("/admin", "Dashboard", "overview"),
  link("/admin/oversight/clubs", "Club health", "oversight"),
  link("/admin/events", "Events", "programme"),
  link("/admin/events/approvals", "Approvals", "programme"),
  link("/admin/certificates", "Certificates", "programme"),
  link("/admin/announcements", "Announcements", "content"),
  link("/admin/gallery", "Gallery", "content"),
  link("/admin/achievements", "Achievements", "content"),
  link("/admin/attendance", "Attendance", "people"),
  link("/admin/council", "Council", "people"),
  link("/admin/clubs", "Clubs", "people"),
  link("/admin/contact", "Contact", "inbox"),
  link("/admin/feedback", "Feedback", "inbox"),
  link("/admin/users", "Admins", "system"),
  link("/admin/audit", "Audit", "system"),
];

describe("groupNavLinks", () => {
  it("splits a wide role's links into labelled sections in canonical order", () => {
    const sections = groupNavLinks(FULL);
    expect(sections.map((s) => s.label)).toEqual([
      "Overview",
      "Oversight",
      "Programme",
      "Content",
      "People",
      "Inbox",
      "System",
    ]);
    expect(sections[2].links.map((l) => l.label)).toEqual([
      "Events",
      "Approvals",
      "Certificates",
    ]);
  });

  it("orders sections canonically even when the input order is scrambled", () => {
    const scrambled = [...FULL].reverse();
    const sections = groupNavLinks(scrambled);
    expect(sections.map((s) => s.label)).toEqual([
      "Overview",
      "Oversight",
      "Programme",
      "Content",
      "People",
      "Inbox",
      "System",
    ]);
  });

  it("preserves the caller's link order within a section", () => {
    // The layout builds Events before Approvals; grouping must not re-sort them.
    const sections = groupNavLinks(FULL);
    const programme = sections.find((s) => s.label === "Programme")!;
    expect(programme.links.map((l) => l.href)).toEqual([
      "/admin/events",
      "/admin/events/approvals",
      "/admin/certificates",
    ]);
  });

  it("omits a section the role holds no link in", () => {
    const clubHead = FULL.filter((l) =>
      ["/admin", "/admin/events", "/admin/attendance", "/admin/clubs", "/admin/gallery", "/admin/announcements"].includes(
        l.href,
      ),
    );
    const labels = groupNavLinks(clubHead).map((s) => s.label);
    expect(labels).not.toContain("Inbox");
    expect(labels).not.toContain("System");
  });

  it("returns ONE unlabelled section when the role has too few links to need headings", () => {
    // A gallery_manager holds a single link. A "Content" heading over one item
    // is noise, not structure.
    const sections = groupNavLinks([link("/admin/gallery", "Gallery", "content")]);
    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBeNull();
    expect(sections[0].links).toHaveLength(1);
  });

  it("stays flat right below the threshold and groups at it", () => {
    const below = FULL.slice(0, GROUPING_THRESHOLD - 1);
    expect(groupNavLinks(below)).toHaveLength(1);
    expect(groupNavLinks(below)[0].label).toBeNull();

    const at = FULL.slice(0, GROUPING_THRESHOLD);
    expect(groupNavLinks(at).every((s) => s.label !== null)).toBe(true);
  });

  it("never drops or duplicates a link, grouped or flat", () => {
    for (const input of [FULL, FULL.slice(0, 3)]) {
      const out = groupNavLinks(input).flatMap((s) => s.links);
      expect(out).toHaveLength(input.length);
      expect(new Set(out.map((l) => l.href)).size).toBe(input.length);
    }
  });

  it("returns no sections for no links", () => {
    expect(groupNavLinks([])).toEqual([]);
  });
});

describe("activeHref", () => {
  it("marks only the LONGEST matching link, not every prefix of the path", () => {
    // The bug this replaces: `startsWith` lit up both Events and Approvals on
    // /admin/events/approvals, because the former is a prefix of the latter.
    expect(activeHref(FULL, "/admin/events/approvals")).toBe("/admin/events/approvals");
  });

  it("still matches a parent link on a child route that has no link of its own", () => {
    expect(activeHref(FULL, "/admin/events/new")).toBe("/admin/events");
    expect(activeHref(FULL, "/admin/attendance/members/abc/edit")).toBe("/admin/attendance");
  });

  it("matches the dashboard only on an exact path", () => {
    // "/admin" prefixes every admin route, so it must never win by prefix.
    expect(activeHref(FULL, "/admin")).toBe("/admin");
    expect(activeHref(FULL, "/admin/gallery")).toBe("/admin/gallery");
    expect(activeHref(FULL, "/admin/clubs")).not.toBe("/admin");
  });

  it("does not match a sibling whose href is a string prefix but not a path prefix", () => {
    const links = [link("/admin/club", "Club", "people"), link("/admin/clubs", "Clubs", "people")];
    expect(activeHref(links, "/admin/clubs")).toBe("/admin/clubs");
    expect(activeHref(links, "/admin/club")).toBe("/admin/club");
  });

  it("returns null when nothing matches", () => {
    expect(activeHref(FULL, "/somewhere-else")).toBeNull();
  });
});

describe("activeLabel", () => {
  it("names the current page for the collapsed mobile bar", () => {
    expect(activeLabel(FULL, "/admin/events/approvals")).toBe("Approvals");
    expect(activeLabel(FULL, "/admin/attendance/members/new")).toBe("Attendance");
  });

  it("is null when nothing matches, so the bar shows no stale label", () => {
    expect(activeLabel(FULL, "/nope")).toBeNull();
  });
});

describe("the Oversight group", () => {
  it("sits between Overview and Programme", () => {
    const labels = groupNavLinks(FULL).map((s) => s.label);
    expect(labels.indexOf("Oversight")).toBe(labels.indexOf("Overview") + 1);
    expect(labels.indexOf("Oversight")).toBeLessThan(labels.indexOf("Programme"));
  });

  it("does not render as a heading for a role that holds no oversight link", () => {
    // Groups with no links are dropped, so a club head never sees the heading.
    const clubHead: NavLink[] = FULL.filter((l) => l.group !== "oversight");
    expect(groupNavLinks(clubHead).map((s) => s.label)).not.toContain("Oversight");
  });

  it("marks Club health current on its own route", () => {
    expect(activeHref(FULL, "/admin/oversight/clubs")).toBe("/admin/oversight/clubs");
    expect(activeLabel(FULL, "/admin/oversight/clubs")).toBe("Club health");
  });

  it("does not let the dashboard steal current from an oversight route", () => {
    // `/admin` covers every admin path by prefix; longest-match must win.
    expect(activeHref(FULL, "/admin/oversight/clubs")).not.toBe("/admin");
  });
});
