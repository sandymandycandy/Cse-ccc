import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ListRow } from "@/lib/certificates/sheet";

// The actions module pulls in next-auth, which can't load under vitest. This
// test renders markup, so the actions are never called.
vi.mock("@/app/admin/(app)/events/[id]/certificates/actions", () => ({
  addCertificateListRowAction: vi.fn(),
  removeCertificateListRowAction: vi.fn(),
  updateCertificateListRowAction: vi.fn(),
  uploadCertificateSheetAction: vi.fn(),
}));

const { ListEditor } = await import("./ListEditor");

const rows: ListRow[] = [
  { id: "r1", row_no: 1, name: "Asha R", email: "asha@example.test", roll: "VTU27001", data: {} },
  { id: "r2", row_no: 2, name: "Karthik S", email: null, roll: "VTU27044", data: {} },
];

const render = (over: Partial<Parameters<typeof ListEditor>[0]> = {}) =>
  renderToStaticMarkup(
    <ListEditor eventId="e1" groupId="g1" groupName="Volunteers" rows={rows} offline {...over} />,
  );

describe("ListEditor", () => {
  it("lists the people typed in so far, with roll numbers", () => {
    const html = render();
    expect(html).toContain("Asha R");
    expect(html).toContain("asha@example.test");
    expect(html).toContain("VTU27001");
    expect(html).toContain("Karthik S");
  });

  it("shows a dash where someone has no email, rather than an empty cell", () => {
    expect(render()).toContain("<td data-label=\"Email\">—</td>");
  });

  it("offers name, email and roll no. to type into", () => {
    const html = render();
    for (const label of ["Name", "Email", "Roll no."]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).toContain("+ Add");
  });

  it("reads as cards on a phone, like the other certificate tables", () => {
    expect(render()).toContain("tablewrap cards");
  });

  it("says what to do when nobody has been added yet", () => {
    const html = render({ rows: [] });
    expect(html).toContain("Nobody in Volunteers yet.");
    expect(html).not.toContain("tablewrap cards");
  });
});
