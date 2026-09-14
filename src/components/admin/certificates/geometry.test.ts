import { describe, it, expect } from "vitest";
import { clampPct, pctToPt, pctToPx, ptToPct, pxToPct, resizeRect, snapMove, snapTargets, MIN_BOX_PX } from "./geometry";

const start = { x: 100, y: 100, w: 200, h: 100 };

describe("resizeRect", () => {
  it("pins the opposite edge for free resizes", () => {
    expect(resizeRect(start, "e", 50, 0, false)).toEqual({ x: 100, y: 100, w: 250, h: 100 });
    expect(resizeRect(start, "nw", 20, 10, false)).toEqual({ x: 120, y: 110, w: 180, h: 90 });
  });

  it("keeps the aspect ratio from a corner", () => {
    expect(resizeRect(start, "se", 100, 0, true)).toEqual({ x: 100, y: 100, w: 300, h: 150 });
    expect(resizeRect(start, "nw", -100, 0, true)).toEqual({ x: 0, y: 50, w: 300, h: 150 });
  });

  it("grows the other axis around the centre from an edge when aspect-locked", () => {
    expect(resizeRect(start, "e", 100, 0, true)).toEqual({ x: 100, y: 75, w: 300, h: 150 });
  });

  it("never collapses below the minimum size", () => {
    const r = resizeRect(start, "w", 500, 0, false);
    expect(r.w).toBe(MIN_BOX_PX);
    expect(r.x).toBe(100 + 200 - MIN_BOX_PX);
  });
});

describe("snapMove", () => {
  const targets = snapTargets({ widthPx: 1000, heightPx: 800 }, [{ x: 600, y: 600, w: 100, h: 50 }]);

  it("snaps the box centre to the page centre and reports a guide", () => {
    const { rect, guides } = snapMove({ x: 403, y: 10, w: 200, h: 100 }, targets, 5);
    expect(rect.x).toBe(400);
    expect(guides).toEqual([{ axis: "x", at: 500 }]);
  });

  it("snaps edges to another box and ignores far targets", () => {
    const { rect, guides } = snapMove({ x: 100, y: 647, w: 50, h: 50 }, targets, 5);
    expect(rect.y).toBe(650);
    expect(guides).toEqual([{ axis: "y", at: 650 }]);
    expect(snapMove({ x: 120, y: 200, w: 50, h: 50 }, targets, 5).guides).toEqual([]);
  });
});

describe("% ↔ px", () => {
  it("round-trips", () => {
    const page = { widthPx: 3508, heightPx: 2480 };
    const pct = { x: 12.5, y: 40, w: 50, h: 7.25 };
    expect(pxToPct(pctToPx(pct, page), page)).toEqual(pct);
  });

  it("clamps into the range validation accepts", () => {
    expect(clampPct({ x: -80, y: 200, w: 0.1, h: 500 })).toEqual({ x: -50, y: 150, w: 0.5, h: 200 });
  });
});

describe("pt ↔ %", () => {
  it("converts against an A4-sized PDF page", () => {
    const landscape = { widthPx: 3508, heightPx: 2480 };
    expect(pctToPt(4, landscape)).toBe(23.8);
    expect(ptToPct(23.8, landscape)).toBe(4);
    const portrait = { widthPx: 2480, heightPx: 3508 };
    expect(pctToPt(4, portrait)).toBe(33.7);
  });
});
