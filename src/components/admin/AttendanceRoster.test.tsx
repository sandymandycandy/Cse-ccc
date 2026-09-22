import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AttendanceRoster } from "./AttendanceRoster";

type Row = Parameters<typeof AttendanceRoster>[0]["rows"][0];

const member = (over: Partial<Row> = {}): Row => ({
  memberId: "m1",
  name: "Aakif Ahmed",
  rollNo: "34899",
  attended: 8,
  eligible: 10,
  pct: 80,
  ...over,
});

const table = (rows: Row[]) => renderToStaticMarkup(<AttendanceRoster rows={rows} />);

describe("AttendanceRoster", () => {
  it("uses the shared list surface rather than a hand-rolled search box", () => {
    const html = table([member()]);
    expect(html).toContain("listbar");
    expect(html).not.toContain('class="search-input"');
  });

  it("flags a member who is behind, and leaves everyone else plain", () => {
    expect(table([member({ pct: 30 })])).toContain('data-risk="true"');
    expect(table([member({ pct: 80 })])).toContain('data-risk="false"');
  });

  it("treats the threshold as a floor, not a ceiling", () => {
    // 50 is "at" the watchlist's lowest threshold, so it is not yet at risk.
    expect(table([member({ pct: 50 })])).toContain('data-risk="false"');
    expect(table([member({ pct: 49 })])).toContain('data-risk="true"');
  });

  it("counts members by name", () => {
    expect(table([member({ memberId: "a" }), member({ memberId: "b" })])).toContain("2 members");
  });

  it("stands in for a missing roll number", () => {
    expect(table([member({ rollNo: null })])).toContain("—");
  });
});
