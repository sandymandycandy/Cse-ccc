import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CharCount } from "./CharCount";

const html = (value: string, max: number) =>
  renderToStaticMarkup(<CharCount value={value} max={max} />);

describe("CharCount", () => {
  it("stays out of the way until the limit is in sight", () => {
    expect(html("x".repeat(50), 100)).toBe("");
    expect(html("x".repeat(79), 100)).toBe("");
  });

  it("appears at four fifths of the limit", () => {
    expect(html("x".repeat(80), 100)).toContain("80 / 100");
  });

  // The field's own maxLength counts raw characters, so the counter must too —
  // trimming would show "118 / 120" on a subject the browser has already
  // stopped accepting. (The older sibling in FeedbackForm.tsx trims; that form
  // has no maxLength to disagree with.)
  it("counts raw characters, including the spaces maxLength counts", () => {
    expect(html(`${"x".repeat(80)}   `, 100)).toContain("83 / 100");
  });

  it("reads as a warning only once the limit is actually passed", () => {
    expect(html("x".repeat(95), 100)).toContain('data-near-limit="near"');
    expect(html("x".repeat(100), 100)).toContain('data-near-limit="near"');
    expect(html("x".repeat(101), 100)).toContain('data-near-limit="over"');
  });
});
