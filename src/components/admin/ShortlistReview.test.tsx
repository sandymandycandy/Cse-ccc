import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ShortlistReview, type ReviewItem } from "./ShortlistReview";

vi.mock("@/app/admin/(app)/events/[id]/shortlist/actions", () => ({
  setShortlistDecisionAction: vi.fn(),
  finaliseShortlistAction: vi.fn(),
}));

const item = (id: string, state: ReviewItem["state"], name: string): ReviewItem => ({
  id,
  state,
  team: {
    index: Number(id.slice(1)),
    name,
    people: [{ index: 1, name: "Lead", roll: "L1", department: null, year: null, email: null, phone: null, role: "leader", team: 1, teamOf: "Lead" }],
    answers: [],
  },
  search: [name],
  choices: { th: name === "Doves" ? null : name.length > 4 ? "Theme-2 - Agents" : "Theme-1 - Green" },
});

describe("ShortlistReview", () => {
  it("shows counts per category and the pending finalise number", () => {
    const html = renderToStaticMarkup(
      <ShortlistReview eventId="e" canEdit items={[item("r1", "undecided", "Owls"), item("r2", "picked", "Hawks"), item("r3", "finalised", "Crows"), item("r4", "waitlist", "Doves")]} />,
    );
    expect(html).toContain("Shortlisted (2)");
    expect(html).toContain("Waiting list (1)");
    expect(html).toContain("Finalise &amp; email (1)");
    expect(html).toContain("Emailed");
  });

  it("disables Finalise when nothing is pending", () => {
    const html = renderToStaticMarkup(
      <ShortlistReview eventId="e" canEdit items={[item("r1", "finalised", "Crows"), item("r2", "waitlist", "Doves")]} />,
    );
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Finalise &amp; email \(0\)/);
  });

  it("read-only viewers see categories but no switch or finalise", () => {
    const html = renderToStaticMarkup(
      <ShortlistReview eventId="e" canEdit={false} items={[item("r1", "picked", "Hawks")]} />,
    );
    expect(html).not.toContain("Finalise");
    expect(html).not.toContain('role="radiogroup"');
    expect(html).toContain("Shortlisted");
  });

  it("sections teams by the theme question, in option order, with per-theme counts", () => {
    const html = renderToStaticMarkup(
      <ShortlistReview eventId="e" canEdit defaultGroup="th"
        groupFields={[{ id: "th", label: "Choose the theme", options: ["Theme-1 - Green", "Theme-2 - Agents"] }]}
        items={[item("r1", "picked", "Owls"), item("r2", "waitlist", "Hawks"), item("r3", "undecided", "Crows"), item("r4", "undecided", "Doves")]} />,
    );
    const order = ["Theme-1 - Green", "Theme-2 - Agents", "Not answered"].map((l) => html.indexOf(`>${l}<`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).toContain("1 team · 1 shortlisted");
    expect(html).toContain("2 teams · 1 waiting");
  });
});
