import { describe, it, expect } from "vitest";
import {
  ADMIN_ROLES,
  grantFor,
  canManage,
  canView,
  canViewClub,
  roleRequiresTotp,
  viewableCapabilities,
  adminHomePath,
  type Capability,
  type AdminRole,
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
  it("requires TOTP for every role that holds all 21 capabilities", () => {
    expect(roleRequiresTotp("tech_head")).toBe(true);
    expect(roleRequiresTotp("president")).toBe(true);
    // faculty and the VP now carry the same blast radius as tech head
    expect(roleRequiresTotp("faculty_advisor")).toBe(true);
    expect(roleRequiresTotp("vice_president")).toBe(true);
  });

  it("no unrestricted role is left without mandatory 2FA", () => {
    for (const role of ADMIN_ROLES) {
      if (viewableCapabilities(role).length === 21) {
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

  // 22 capabilities exist as of 2026-09-04, when view:feedback was added. The
  // count is asserted PER ROLE rather than shared, because the Faculty Advisor
  // now holds 21 of the 22: view:feedback is withheld on purpose (design D2).
  const TOTAL_CAPABILITIES = 22;

  it("vice_president holds every capability the system defines", () => {
    // Pinned: if a new capability is added and this role is left out of its row,
    // viewableCapabilities drops it ("none") and the count falls short.
    expect(viewableCapabilities("vice_president")).toHaveLength(TOTAL_CAPABILITIES);
  });

  it("faculty_advisor holds every capability EXCEPT view:feedback", () => {
    const caps = viewableCapabilities("faculty_advisor");
    expect(caps).toHaveLength(TOTAL_CAPABILITIES - 1);
    expect(caps).not.toContain("view:feedback");
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

  // Was "the three unrestricted roles are faculty, VP and tech head" until
  // 2026-09-04. view:feedback (design D2) dropped the Faculty Advisor out of
  // that set on purpose, leaving two. Do not "restore" the faculty grant to
  // make this read three again — that would break the promise on the feedback
  // form, not fix an inconsistency.
  it("the unrestricted roles are now VP and tech head only", () => {
    const full = ADMIN_ROLES.filter(
      (r) => viewableCapabilities(r).length === TOTAL_CAPABILITIES,
    );
    expect(full.slice().sort()).toEqual(["tech_head", "vice_president"]);
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

describe("gallery_manager — a gallery-only admin (owner ask, 2026-09-02)", () => {
  const gm = { role: "gallery_manager", clubId: null } as const;

  it("is a real admin role", () => {
    expect(ADMIN_ROLES).toContain("gallery_manager");
  });

  it("holds exactly one capability: manage:gallery", () => {
    expect(viewableCapabilities("gallery_manager")).toEqual(["manage:gallery"]);
    expect(grantFor("gallery_manager", "manage:gallery")).toBe("all");
  });

  it("manages council-wide photos with no club of its own", () => {
    expect(canManage(gm, "manage:gallery")).toBe(true);
    expect(canManage(gm, "manage:gallery", "c1")).toBe(true);
  });

  it("cannot reach announcements or achievements, which share manage:content", () => {
    expect(grantFor("gallery_manager", "manage:content")).toBe("none");
    expect(canView(gm, "manage:content")).toBe(false);
    expect(canManage(gm, "manage:content")).toBe(false);
  });

  it("cannot reach any other admin surface", () => {
    for (const cap of [
      "manage:events", "approve:events", "cancel:events", "manage:registrations",
      "manage:results", "manage:members", "manage:council", "manage:clubs",
      "manage:contact", "manage:resources", "manage:venues", "manage:admins",
      "view:audit", "view:analytics", "revoke:certificate",
      "issue:participation_certificate", "issue:winner_certificate",
      "manage:blackouts", "manage:schedules",
    ] as const) {
      expect(grantFor("gallery_manager", cap)).toBe("none");
      expect(canView(gm, cap)).toBe(false);
      expect(canManage(gm, cap, "c1")).toBe(false);
    }
  });

  it("is not forced into TOTP — its blast radius is one table of photos", () => {
    expect(roleRequiresTotp("gallery_manager")).toBe(false);
  });

  it("does not widen anyone: no existing role gained or lost gallery access", () => {
    // manage:gallery was split OUT of manage:content, so the two rows must stay
    // identical for every pre-existing role. Drift here silently changes access.
    for (const role of ADMIN_ROLES) {
      if (role === "gallery_manager") continue;
      expect(grantFor(role, "manage:gallery")).toBe(grantFor(role, "manage:content"));
    }
  });

  it("a club-scoped head still only manages their own club's photos", () => {
    const head = { role: "club_head", clubId: "c1" } as const;
    expect(canManage(head, "manage:gallery", "c1")).toBe(true);
    expect(canManage(head, "manage:gallery", "c2")).toBe(false);
  });
});

describe("adminHomePath — where the nav's home link points", () => {
  it("sends a gallery-only admin to the gallery, not the events dashboard", () => {
    expect(adminHomePath("gallery_manager")).toBe("/admin/gallery");
  });

  it("sends every other role to the dashboard", () => {
    for (const role of ADMIN_ROLES) {
      if (role === "gallery_manager") continue;
      expect(adminHomePath(role)).toBe("/admin");
    }
  });
});

describe("view:feedback", () => {
  const id = (role: AdminRole) => ({ role, clubId: null });

  it("is held by president, vice president and tech head", () => {
    expect(canView(id("president"), "view:feedback")).toBe(true);
    expect(canView(id("vice_president"), "view:feedback")).toBe(true);
    expect(canView(id("tech_head"), "view:feedback")).toBe(true);
  });

  // Deliberate exception to the "Faculty / VP / Tech are unrestricted" rule
  // (design D2). If this test fails because someone added the faculty grant
  // "for consistency", the grant is the bug, not the test.
  it("is NOT held by the faculty advisor", () => {
    expect(canView(id("faculty_advisor"), "view:feedback")).toBe(false);
  });

  it("is held by no club-scoped or narrow role", () => {
    for (const role of [
      "club_head",
      "vice_head",
      "events_head",
      "docs_head",
      "social_media_head",
      "gallery_manager",
    ] as const) {
      expect(canView(id(role), "view:feedback")).toBe(false);
    }
  });
});

describe("council oversight is gated on manage:council, not view:analytics", () => {
  // Design D2. `view:analytics` is held at "own" by club and vice heads and at
  // "all" by events and social media heads — gating the cross-club oversight
  // pages on it would hand every club's numbers to nine roles. If this test
  // fails because the gate moved, the gate is wrong, not the test.
  const clubHead = { role: "club_head", clubId: "c1" } as const;
  const viceHead = { role: "vice_head", clubId: "c1" } as const;
  const eventsHead = { role: "events_head", clubId: null } as const;
  const socialHead = { role: "social_media_head", clubId: null } as const;

  it("is visible to exactly the four council roles", () => {
    for (const role of ["faculty_advisor", "president", "vice_president", "tech_head"] as const) {
      expect(canView({ role, clubId: null }, "manage:council")).toBe(true);
    }
  });

  it("is refused to every role that holds view:analytics but not manage:council", () => {
    for (const who of [clubHead, viceHead, eventsHead, socialHead]) {
      expect(canView(who, "view:analytics")).toBe(true);
      expect(canView(who, "manage:council")).toBe(false);
    }
  });
});
