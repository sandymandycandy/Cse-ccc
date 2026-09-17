import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CohostPicker } from "./CohostPicker";

const clubs = [
  { id: "c-coding", name: "Coding Club" },
  { id: "c-forge", name: "AI Forge" },
  { id: "c-yoga", name: "Yoga Club" },
];

const render = (over: Partial<Parameters<typeof CohostPicker>[0]> = {}) =>
  renderToStaticMarkup(
    <CohostPicker clubs={clubs} primaryClubId="c-coding" selected={[]} {...over} />,
  );

/** The whole <input> tag for one club, so assertions don't depend on attribute order. */
const inputFor = (html: string, id: string) =>
  html.match(new RegExp(`<input[^>]*value="${id}"[^>]*>`))?.[0] ?? null;

describe("CohostPicker", () => {
  it("offers every club except the one hosting", () => {
    const html = render();
    expect(inputFor(html, "c-coding")).toBeNull();
    expect(html).toContain("AI Forge");
    expect(html).toContain("Yoga Club");
  });

  it("offers every club before a hosting club is chosen", () => {
    const html = render({ primaryClubId: "" });
    for (const c of clubs) expect(inputFor(html, c.id)).not.toBeNull();
  });

  it("posts each tick as cohostIds", () => {
    expect(render().match(/name="cohostIds"/g)).toHaveLength(2);
  });

  it("ticks the current co-hosts and nothing else", () => {
    const html = render({ selected: ["c-forge"] });
    expect(inputFor(html, "c-forge")).toContain("checked");
    expect(inputFor(html, "c-yoga")).not.toContain("checked");
  });

  it("shows the complaint under the picker and marks the field", () => {
    const html = render({ fieldErrors: { cohostIds: "One of those clubs can't co-host." } });
    expect(html).toContain("One of those clubs can&#x27;t co-host.");
    expect(html).toContain('class="field err"');
  });
});
