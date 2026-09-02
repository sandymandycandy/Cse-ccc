import { describe, it, expect } from "vitest";
import {
  ADMIN_ROLES,
  grantFor,
  canManage,
  canView,
  canViewClub,
  roleRequiresTotp,
  viewableCapabilities,
  type Capability,
} from "./capabilities";

describe("manage:results grants", () => {
  it("grants all to org-wide organiser roles", () => {
    for (const role of ["president", "vice_president", "tech_head", "events_head"] as const) {
      expect(grantFor(role, "manage:results")).toBe("all");
    }
  });

  it("grants own to club heads and vice heads", () => {
    expect(grantFor("club_head", "manage:results")).toBe("own");
    expect(grantFor("vice_head", "manage:results")).toBe("own");
  });

  it("faculty holds all; unlisted roles are none", () => {
    expect(grantFor("faculty_advisor", "manage:results")).toBe("all");
    expect(grantFor("docs_head", "manage:results")).toBe("none");
  });

  it("own grant is club-scoped", () => {
    const head = { role: "club_head", clubId: "c1" } as const;
    expect(canManage(head, "manage:results", "c1")).toBe(true);
    expect(canManage(head, "manage:results", "c2")).toBe(false);
  });
});

describe("manage:members grants", () => {
  it("club head/vice head manage their own club; org-wide and faculty manage all", () => {
    expect(grantFor("club_head", "manage:members")).toBe("own");
    expect(grantFor("vice_head", "manage:members")).toBe("own");
    expect(grantFor("president", "manage:members")).toBe("all");
    expect(grantFor("tech_head", "manage:members")).toBe("all");
    expect(grantFor("faculty_advisor", "manage:members")).toBe("all");
    expect(grantFor("events_head", "manage:members")).toBe("none");
  });
});

describe("manage:clubs grants", () => {
  it("club head/vice head edit their own club; org-wide and faculty edit all", () => {
    expect(grantFor("club_head", "manage:clubs")).toBe("own");
    expect(grantFor("vice_head", "manage:clubs")).toBe("own");
    expect(grantFor("president", "manage:clubs")).toBe("all");
    expect(grantFor("vice_president", "manage:clubs")).toBe("all");
    expect(grantFor("tech_head", "manage:clubs")).toBe("all");
    expect(grantFor("faculty_advisor", "manage:clubs")).toBe("all");
    expect(grantFor("events_head", "manage:clubs")).toBe("none");
    expect(grantFor("docs_head", "manage:clubs")).toBe("none");
  });

  it("a head can edit only their own club's profile", () => {
    const head = { role: "club_head", clubId: "c1" } as const;
    expect(canManage(head, "manage:clubs", "c1")).toBe(true);
    expect(canManage(head, "manage:clubs", "c2")).toBe(false);
  });
});

describe("manage:contact grants (council-wide, no club scope)", () => {
  it("council + social media + faculty manage; club roles none", () => {
    expect(grantFor("president", "manage:contact")).toBe("all");
    expect(grantFor("vice_president", "manage:contact")).toBe("all");
    expect(grantFor("tech_head", "manage:contact")).toBe("all");
    expect(grantFor("social_media_head", "manage:contact")).toBe("all");
    expect(grantFor("faculty_advisor", "manage:contact")).toBe("all");
    expect(grantFor("club_head", "manage:contact")).toBe("none");
    expect(grantFor("events_head", "manage:contact")).toBe("none");
  });

  it("an all grant can act with no club context (council-wide surface)", () => {
    const pres = { role: "president", clubId: null } as const;
    expect(canManage(pres, "manage:contact")).toBe(true);
  });
});

describe("manage:council grants (org-wide leadership attendance)", () => {
  it("president, VP, tech head and faculty can manage; heads cannot", () => {
    expect(canManage({ role: "president", clubId: null }, "manage:council")).toBe(true);
    expect(canManage({ role: "vice_president", clubId: null }, "manage:council")).toBe(true);
    expect(canManage({ role: "tech_head", clubId: null }, "manage:council")).toBe(true);
    expect(canManage({ role: "faculty_advisor", clubId: null }, "manage:council")).toBe(true);
    expect(canView({ role: "faculty_advisor", clubId: null }, "manage:council")).toBe(true);
    expect(canManage({ role: "club_head", clubId: "c1" }, "manage:council")).toBe(false);
    expect(canView({ role: "club_head", clubId: "c1" }, "manage:council")).toBe(false);
    expect(canView({ role: "events_head", clubId: null }, "manage:council")).toBe(false);
  });
});

describe("canViewClub — read-or-manage view scope for a specific club", () => {
  it("faculty views and manages every club, with no club of their own", () => {
    const faculty = { role: "faculty_advisor", clubId: null } as const;
    expect(canViewClub(faculty, "manage:members", "c1")).toBe(true);
    expect(canViewClub(faculty, "manage:members", "c2")).toBe(true);
    expect(canManage(faculty, "manage:members", "c1")).toBe(true);
    expect(canManage(faculty, "manage:members", "c2")).toBe(true);
  });

  it("council-wide managers (all) view every club", () => {
    const pres = { role: "president", clubId: null } as const;
    expect(canViewClub(pres, "manage:members", "c1")).toBe(true);
  });

  it("own-scoped heads view only their own club", () => {
    const head = { role: "club_head", clubId: "c1" } as const;
    expect(canViewClub(head, "manage:members", "c1")).toBe(true);
    expect(canViewClub(head, "manage:members", "c2")).toBe(false);
  });

  it("a role with no grant, or a null club, views nothing", () => {
    const eventsHead = { role: "events_head", clubId: null } as const;
    expect(canViewClub(eventsHead, "manage:members", "c1")).toBe(false);
    const pres = { role: "president", clubId: null } as const;
    expect(canViewClub(pres, "manage:members", null)).toBe(false);
  });
});

describe("roleRequiresTotp — mandatory 2FA for the widest-reach roles", () => {
  it("requires TOTP for every role that holds all 20 capabilities", () => {
    expect(roleRequiresTotp("tech_head")).toBe(true);
    expect(roleRequiresTotp("president")).toBe(true);
    // faculty and the VP now carry the same blast radius as tech head
    expect(roleRequiresTotp("faculty_advisor")).toBe(true);
    expect(roleRequiresTotp("vice_president")).toBe(true);
  });

  it("no unrestricted role is left without mandatory 2FA", () => {
    for (const role of ADMIN_ROLES) {
      if (viewableCapabilities(role).length === 20) {
        expect(roleRequiresTotp(role)).toBe(true);
      }
    }
  });

  it("does not force it on other roles", () => {
    for (const role of ["events_head", "docs_head", "club_head", "vice_head"] as const) {
      expect(roleRequiresTotp(role)).toBe(false);
    }
  });
});

describe("full-access roles (owner decision, 2026-09-02)", () => {
  const FULL = ["faculty_advisor", "vice_president"] as const;

  it.each(FULL)("%s holds every capability the system defines", (role) => {
    // Pinned: if a new capability is added and this role is left out of its row,
    // viewableCapabilities drops it ("none") and the count falls short.
    expect(viewableCapabilities(role)).toHaveLength(20);
  });

  it.each(FULL)("%s holds them at \"all\", never \"read\" or \"own\"", (role) => {
    for (const cap of viewableCapabilities(role)) {
      expect(grantFor(role, cap)).toBe("all");
    }
  });

  it.each(FULL)("%s can manage every capability with no club context", (role) => {
    const id = { role, clubId: null };
    for (const cap of viewableCapabilities(role)) {
      expect(canManage(id, cap)).toBe(true);
      expect(canView(id, cap)).toBe(true);
    }
  });

  it.each(FULL)("%s can manage the admin roster, which only tech head could before", (role) => {
    expect(canManage({ role, clubId: null }, "manage:admins")).toBe(true);
  });

  it("the three unrestricted roles are faculty, VP and tech head", () => {
    const full = ADMIN_ROLES.filter((r) => viewableCapabilities(r).length === 20);
    expect(full.slice().sort()).toEqual(["faculty_advisor", "tech_head", "vice_president"]);
  });

  it("the president was NOT widened — still no admin roster, audit stays read", () => {
    const pres = { role: "president", clubId: null } as const;
    expect(canManage(pres, "manage:admins")).toBe(false);
    expect(grantFor("president", "view:audit")).toBe("read");
    expect(grantFor("president", "revoke:certificate")).toBe("none");
  });

  it("did not widen anyone else — club head stays own-scoped", () => {
    const head = { role: "club_head", clubId: "c1" } as const;
    expect(canManage(head, "manage:results", "c2")).toBe(false);
    expect(canManage(head, "manage:admins" as Capability)).toBe(false);
    expect(grantFor("events_head", "manage:admins")).toBe("none");
  });
});
