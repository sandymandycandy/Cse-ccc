import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClubPicker } from "./ClubPicker";

const clubs = [
  { id: "c1", name: "Coding Club" },
  { id: "c2", name: "Robotics" },
];

const picker = (over: Partial<Parameters<typeof ClubPicker>[0]> = {}) =>
  renderToStaticMarkup(<ClubPicker clubs={clubs} clubId="c1" show {...over} />);

describe("ClubPicker", () => {
  it("renders nothing for a head pinned to one club", () => {
    expect(picker({ show: false })).toBe("");
  });

  it("renders nothing when there are no clubs to choose between", () => {
    expect(picker({ clubs: [] })).toBe("");
  });

  it("preselects the club being viewed", () => {
    const html = picker();
    expect(html).toContain('value="c1" selected');
  });

  it("carries other query params through, so a club switch keeps the threshold", () => {
    const html = picker({ hidden: { below: "60" } });
    expect(html).toContain('type="hidden" name="below" value="60"');
  });

  it("stays a GET form, so the club lands in a shareable URL", () => {
    expect(picker()).toContain('method="get"');
  });
});
