import { describe, it, expect } from "vitest";
import { grantFor, canManage, canView, canViewClub, roleRequiresTotp } from "./capabilities";

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

  it("faculty is read-only; unlisted roles are none", () => {
    expect(grantFor("faculty_advisor", "manage:results")).toBe("read");
    expect(grantFor("docs_head", "manage:results")).toBe("none");
  });

  it("own grant is club-scoped", () => {
    const head = { role: "club_head", clubId: "c1" } as const;
    expect(canManage(head, "manage:results", "c1")).toBe(true);
    expect(canManage(head, "manage:results", "c2")).toBe(false);
  });
});

describe("manage:members grants", () => {
  it("club head/vice head manage their own club; org-wide manage all; faculty read", () => {
    expect(grantFor("club_head", "manage:members")).toBe("own");
    expect(grantFor("vice_head", "manage:members")).toBe("own");
    expect(grantFor("president", "manage:members")).toBe("all");
    expect(grantFor("tech_head", "manage:members")).toBe("all");
    expect(grantFor("faculty_advisor", "manage:members")).toBe("read");
    expect(grantFor("events_head", "manage:members")).toBe("none");
  });
});

describe("manage:clubs grants", () => {
  it("club head/vice head edit their own club; org-wide edit all; faculty read", () => {
    expect(grantFor("club_head", "manage:clubs")).toBe("own");
    expect(grantFor("vice_head", "manage:clubs")).toBe("own");
    expect(grantFor("president", "manage:clubs")).toBe("all");
    expect(grantFor("vice_president", "manage:clubs")).toBe("all");
    expect(grantFor("tech_head", "manage:clubs")).toBe("all");
    expect(grantFor("faculty_advisor", "manage:clubs")).toBe("read");
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
  it("council + social media manage; faculty read; club roles none", () => {
    expect(grantFor("president", "manage:contact")).toBe("all");
    expect(grantFor("vice_president", "manage:contact")).toBe("all");
    expect(grantFor("tech_head", "manage:contact")).toBe("all");
    expect(grantFor("social_media_head", "manage:contact")).toBe("all");
    expect(grantFor("faculty_advisor", "manage:contact")).toBe("read");
    expect(grantFor("club_head", "manage:contact")).toBe("none");
    expect(grantFor("events_head", "manage:contact")).toBe("none");
  });

  it("an all grant can act with no club context (council-wide surface)", () => {
    const pres = { role: "president", clubId: null } as const;
    expect(canManage(pres, "manage:contact")).toBe(true);
  });
});

describe("manage:council grants (org-wide leadership attendance)", () => {
  it("president, VP, and tech head can manage; faculty can only view; heads cannot", () => {
    expect(canManage({ role: "president", clubId: null }, "manage:council")).toBe(true);
    expect(canManage({ role: "vice_president", clubId: null }, "manage:council")).toBe(true);
    expect(canManage({ role: "tech_head", clubId: null }, "manage:council")).toBe(true);
    expect(canManage({ role: "faculty_advisor", clubId: null }, "manage:council")).toBe(false);
    expect(canView({ role: "faculty_advisor", clubId: null }, "manage:council")).toBe(true);
    expect(canManage({ role: "club_head", clubId: "c1" }, "manage:council")).toBe(false);
    expect(canView({ role: "club_head", clubId: "c1" }, "manage:council")).toBe(false);
    expect(canView({ role: "events_head", clubId: null }, "manage:council")).toBe(false);
  });
});

describe("canViewClub — read-or-manage view scope for a specific club", () => {
  it("faculty (read) can view any club's dashboard but cannot manage it", () => {
    const faculty = { role: "faculty_advisor", clubId: null } as const;
    expect(canViewClub(faculty, "manage:members", "c1")).toBe(true);
    expect(canViewClub(faculty, "manage:members", "c2")).toBe(true);
    expect(canManage(faculty, "manage:members", "c1")).toBe(false);
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
  it("requires TOTP for tech_head and president", () => {
    expect(roleRequiresTotp("tech_head")).toBe(true);
    expect(roleRequiresTotp("president")).toBe(true);
  });

  it("does not force it on other roles", () => {
    for (const role of ["vice_president", "events_head", "club_head", "faculty_advisor"] as const) {
      expect(roleRequiresTotp(role)).toBe(false);
    }
  });
});
