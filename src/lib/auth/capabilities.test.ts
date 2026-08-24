import { describe, it, expect } from "vitest";
import { grantFor, canManage, roleRequiresTotp } from "./capabilities";

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
