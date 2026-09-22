import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The roster imports three server actions. Nothing here presses a button — they
// are mocked only so the module graph does not drag `server-only` and the
// Supabase admin client into a render test.
vi.mock("@/app/admin/(app)/attendance/actions", () => ({
  saveAndCloseAction: vi.fn(),
  saveAttendanceAction: vi.fn(),
  autosaveAttendanceAction: vi.fn(),
}));

const { SessionRoster } = await import("./SessionRoster");

type Mark = Parameters<typeof SessionRoster>[0]["roster"][0];

const member = (over: Partial<Mark> = {}): Mark => ({
  memberId: "m1",
  name: "Aakif Ahmed",
  rollNo: "34899",
  mark: null,
  ...over,
});

const roster = (over: Partial<Parameters<typeof SessionRoster>[0]> = {}) =>
  renderToStaticMarkup(
    <SessionRoster
      sessionId="s1"
      roster={[member()]}
      canEdit
      status="open"
      {...over}
    />,
  );

describe("SessionRoster", () => {
  it("offers both ways to finish an open session", () => {
    const html = roster();
    expect(html).toContain("Save &amp; close session");
    expect(html).toContain("Save draft");
  });

  it("does not offer reopen at the foot of a closed session — that moved to the page head", () => {
    const html = roster({ status: "closed" });
    expect(html).not.toContain("Reopen session");
    expect(html).not.toContain("sroster-actions");
  });

  it("makes a closed session read-only", () => {
    const html = roster({ status: "closed" });
    expect(html).not.toContain('class="seg"');
    expect(html).not.toContain("Mark all present");
  });

  it("makes a session read-only for someone who cannot edit it", () => {
    const html = roster({ canEdit: false });
    expect(html).not.toContain('class="seg"');
    expect(html).not.toContain("sroster-actions");
  });

  it("hides the floating bar until something is actually unsaved", () => {
    // Nothing has been touched on first paint, so a bar saying "not saved yet"
    // would be a lie. It appears on the first mark.
    expect(roster()).not.toContain("sroster-bar");
    expect(roster()).not.toContain("Save attendance");
  });

  it("counts turnout against the whole roster, not the marked subset", () => {
    const html = roster({
      roster: [
        member({ memberId: "a", mark: "present" }),
        member({ memberId: "b", mark: "absent" }),
        member({ memberId: "c", mark: null }),
      ],
    });
    expect(html).toContain("33% turnout");
    expect(html).toContain("1 unmarked");
  });

  it("submits a mark for every member, including the unmarked ones", () => {
    // "Not in the present list" must not silently mean absent on save.
    const html = roster({
      roster: [member({ memberId: "a", mark: "present" }), member({ memberId: "b", mark: null })],
    });
    expect(html).toContain('name="present" value="a"');
    expect(html).toContain('name="unmarked" value="b"');
  });

  it("tells a club head with an empty roster why there is nobody to mark", () => {
    expect(roster({ roster: [] })).toContain("No approved members yet");
  });
});
