import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/admin/(app)/email/actions", () => ({ previewAudienceAction: vi.fn() }));

const { RecipientPicker, filterRecipients } = await import("./RecipientPicker");

const list = [
  { email: "vtu27884@veltech.edu.in", name: "Sandeep Kumar S", meta: "Club Head · AI Forge" },
  { email: "vtu30363@veltech.edu.in", name: "T Sai Varun", meta: "Vice Head · Coding Club" },
  { email: "someone@gmail.test", name: null },
];

describe("filterRecipients", () => {
  it("returns everyone for an empty query", () => {
    expect(filterRecipients(list, "")).toHaveLength(3);
    expect(filterRecipients(list, "   ")).toHaveLength(3);
  });

  it("matches on the name", () => {
    expect(filterRecipients(list, "sandeep")).toEqual([list[0]]);
  });

  it("matches on the address", () => {
    expect(filterRecipients(list, "30363")).toEqual([list[1]]);
  });

  it("ignores case on both sides", () => {
    expect(filterRecipients(list, "SAI VARUN")).toEqual([list[1]]);
  });

  // A picker that crashed on the one recipient without a name would break
  // exactly on the typed-address audience, where nobody has one.
  it("survives a recipient with no name and no role line", () => {
    expect(filterRecipients(list, "gmail")).toEqual([list[2]]);
    expect(() => filterRecipients(list, "anything")).not.toThrow();
  });

  // What makes a 909-person list usable: narrowing it to one club, or to the
  // vice heads, without scrolling.
  it("matches on the club, so a long list can be narrowed to one", () => {
    expect(filterRecipients(list, "AI Forge")).toEqual([list[0]]);
    expect(filterRecipients(list, "coding")).toEqual([list[1]]);
  });

  it("matches on the role", () => {
    expect(filterRecipients(list, "vice head")).toEqual([list[1]]);
    expect(filterRecipients(list, "head")).toHaveLength(2);
  });
});

describe("RecipientPicker", () => {
  const html = renderToStaticMarkup(<RecipientPicker audience={{ kind: "heads" }} />);

  it("costs nothing until asked — no list is fetched on render", () => {
    expect(html).toContain("See who gets it");
    expect(html).not.toContain("rpick-list");
  });

  /**
   * ⚠️ The field must exist even when nobody is unticked. A browser omits an
   * absent field entirely, and the send reads `exclude` unconditionally.
   */
  it("always posts an exclude field, empty when nothing is unticked", () => {
    expect(html).toContain('name="exclude"');
    expect(html).toContain('value=""');
  });

  // Posting the kept list would make the form the authority on recipients.
  it("never posts an include field", () => {
    expect(html).not.toContain('name="include"');
  });
});
