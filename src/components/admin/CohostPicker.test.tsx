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

  // ── The dropdown rewrite (2026-09-17) ────────────────────────────────────
  // ⚠️ These render the picker's INITIAL, CLOSED state. `renderToStaticMarkup`
  // runs no effects and handles no clicks, so opening the panel, filtering and
  // removing a chip are not reachable from here — they are the browser pass.

  it("starts closed", () => {
    const html = render();
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/class="cohost-panel"[^>]*hidden/);
  });

  it("keeps every checkbox in the form WHILE CLOSED", () => {
    // The linchpin of the rewrite: the panel is hidden, never unmounted, so a
    // hidden input still posts and `formData.getAll("cohostIds")` is unchanged.
    // Unmounting these would drop co-hosts on save with nothing to show for it.
    const html = render({ selected: ["c-forge"] });
    expect(html).toMatch(/class="cohost-panel"[^>]*hidden/);
    expect(inputFor(html, "c-forge")).toContain("checked");
    expect(html.match(/name="cohostIds"/g)).toHaveLength(2);
  });

  it("summarises the selection on the closed trigger", () => {
    expect(render()).toContain("No co-hosts");
    expect(render({ selected: ["c-forge"] })).toContain("AI Forge");
    expect(render({ selected: ["c-forge", "c-yoga"] })).toContain("+1");
  });

  it("shows a removable chip per co-host, in club order not click order", () => {
    const html = render({ selected: ["c-yoga", "c-forge"] });
    expect(html).toContain("Remove AI Forge as a co-host");
    expect(html).toContain("Remove Yoga Club as a co-host");
    expect(html.indexOf("Remove AI Forge")).toBeLessThan(html.indexOf("Remove Yoga Club"));
  });
});
