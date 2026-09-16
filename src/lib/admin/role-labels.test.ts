import { describe, expect, it } from "vitest";
import { ADMIN_ROLE_LABEL, MEMBER_ROLE_LABEL, describeRecipient } from "./role-labels";

describe("role labels", () => {
  it("names every admin role the enum can hold", () => {
    // Pinned against `admin_role` in database.types.ts. A role added there and
    // not here would render as a raw enum value like `social_media_head`.
    for (const r of [
      "faculty_advisor",
      "president",
      "vice_president",
      "tech_head",
      "events_head",
      "docs_head",
      "social_media_head",
      "club_head",
      "vice_head",
      "gallery_manager",
    ] as const) {
      expect(ADMIN_ROLE_LABEL[r]).toBeTruthy();
      expect(ADMIN_ROLE_LABEL[r]).not.toBe(r);
    }
    expect(ADMIN_ROLE_LABEL.club_head).toBe("Club Head");
    expect(ADMIN_ROLE_LABEL.tech_head).toBe("Technical Head");
  });

  it("names every member role", () => {
    expect(MEMBER_ROLE_LABEL.head).toBe("Head");
    expect(MEMBER_ROLE_LABEL.vice_head).toBe("Vice Head");
    expect(MEMBER_ROLE_LABEL.member).toBe("Member");
  });
});

describe("describeRecipient", () => {
  it("puts the role first and the club after it", () => {
    expect(describeRecipient("Club Head", "AI Forge")).toBe("Club Head · AI Forge");
  });

  it("copes with either half missing", () => {
    expect(describeRecipient("President", null)).toBe("President");
    expect(describeRecipient(null, "AI Forge")).toBe("AI Forge");
    expect(describeRecipient(null, null)).toBeNull();
  });

  // A blank designation in council_members would otherwise render as " · Club".
  it("treats blank strings as missing", () => {
    expect(describeRecipient("   ", "AI Forge")).toBe("AI Forge");
    expect(describeRecipient("President", "  ")).toBe("President");
    expect(describeRecipient("", "")).toBeNull();
  });
});
