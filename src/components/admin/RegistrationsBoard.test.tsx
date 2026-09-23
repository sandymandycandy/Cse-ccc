import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RegistrationsBoard, filterEntries, viewCounts, type BoardEntry } from "./RegistrationsBoard";
import { RegistrationCard } from "./RegistrationCard";

vi.mock("@/app/admin/(app)/events/[id]/registrations/actions", () => ({
  setMemberAttendanceAction: vi.fn(), toggleAttendanceAction: vi.fn(),
}));

const entry = (over: Partial<BoardEntry> = {}): BoardEntry => ({
  id: "r1", title: "Owls", leader: "Lead", attended: false, absent: [], eligible: true,
  people: [
    { position: 0, name: "Lead", role: "Leader", roll: "L1", deptYear: "CSE · 3", email: "l@x.in", phone: null },
    { position: 1, name: "Asha", role: "Member", roll: "A2", deptYear: "", email: null, phone: null },
  ],
  answers: [{ label: "Project", value: "Drone", href: null }],
  search: ["Lead", "Owls", "L1", { team: [{ n: "Asha", r: "A2" }] }],
  ...over,
});

describe("registrations board", () => {
  it("counts each view", () => {
    const rows = [entry(), entry({ id: "r2", attended: true }), entry({ id: "r3", attended: true, absent: [1] })];
    expect(viewCounts(rows)).toEqual({ All: 3, "Not marked": 1, Present: 1, "Partly present": 1 });
    expect(filterEntries(rows, "", "Partly present").map((r) => r.id)).toEqual(["r3"]);
  });

  it("finds a team by a member's roll number", () => {
    expect(filterEntries([entry(), entry({ id: "r2", search: ["Other"] })], "a2", "All").map((r) => r.id)).toEqual(["r1"]);
  });

  it("renders compact rows with team, leader, head-count and the full-team action", () => {
    const html = renderToStaticMarkup(<RegistrationsBoard eventId="e" entries={[entry({ attended: true, absent: [1] })]} canEdit isTeamEvent />);
    expect(html).toContain("Owls");
    expect(html).toContain("Lead");
    expect(html).toContain("2 people · 1 present");
    expect(html).toContain("Partly present");
    expect(html).toContain("Undo");
    expect(html).not.toContain("Project"); // answers live in the card, not the row
  });

  it("offers Mark full team present on an unmarked team, and hides it for viewers", () => {
    expect(renderToStaticMarkup(<RegistrationsBoard eventId="e" entries={[entry()]} canEdit isTeamEvent />)).toContain("Mark full team present");
    expect(renderToStaticMarkup(<RegistrationsBoard eventId="e" entries={[entry()]} canEdit={false} isTeamEvent />)).not.toContain("Mark full team present");
  });

  it("card lists every person with a present/absent choice, then the answers", () => {
    const html = renderToStaticMarkup(
      <RegistrationCard entry={entry({ attended: true, absent: [1] })} canEdit onClose={() => {}} onMark={() => {}} pending={false} error="" />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Asha");
    expect(html).toContain("A2");
    expect(html).toMatch(/aria-label="Asha absent" aria-pressed="true"/);
    expect(html).toMatch(/aria-label="Lead present" aria-pressed="true"/);
    expect(html).toContain("Drone");
  });

  it("card presses nothing on an unmarked team", () => {
    const html = renderToStaticMarkup(
      <RegistrationCard entry={entry()} canEdit onClose={() => {}} onMark={() => {}} pending={false} error="" />,
    );
    expect(html).not.toContain('aria-pressed="true"');
  });
});
