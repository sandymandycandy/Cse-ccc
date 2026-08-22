import { describe, it, expect } from "vitest";
import { grantFor, canManage } from "./capabilities";

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
