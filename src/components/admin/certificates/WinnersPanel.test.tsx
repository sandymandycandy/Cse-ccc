import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The actions module pulls in next-auth, which can't load under vitest. This
// test renders markup, so the actions are never called.
vi.mock("@/app/admin/(app)/events/[id]/certificates/actions", () => ({
  addCertificateListRowAction: vi.fn(),
  removeCertificateListRowAction: vi.fn(),
  updateCertificateListRowAction: vi.fn(),
  uploadCertificateSheetAction: vi.fn(),
  setWinnerSourceAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const { WinnersPanel } = await import("./WinnersPanel");

const render = (over: Partial<Parameters<typeof WinnersPanel>[0]> = {}) =>
  renderToStaticMarkup(
    <WinnersPanel eventId="e1" groupId="g1" groupName="Winners" source="results" people={6} rows={[]} offline {...over} />,
  );

describe("WinnersPanel", () => {
  it("from results, says how many people are on the podium", () => {
    const html = render();
    expect(html).toContain("6 people are on this event");
    expect(html).toMatch(/aria-pressed="true"[^>]*>The published results/);
  });

  it("from results with nothing published, points at Results and offers a list instead", () => {
    const html = render({ people: 0 });
    expect(html).toContain("No published results yet.");
    expect(html).toContain('href="/admin/events/e1/results"');
    expect(html).toContain("Use a list instead");
  });

  it("from a list, shows the typed-in winners instead of the podium", () => {
    const html = render({
      source: "sheet",
      rows: [{ id: "r1", row_no: 1, name: "Asha R", email: null, roll: "VTU27001", data: { Position: "1st" } }],
    });
    expect(html).toContain("Asha R");
    expect(html).toMatch(/aria-pressed="true"[^>]*>A list I enter/);
    expect(html).not.toContain("on this event");
  });
});
